import type { Player } from '../types/player'
import type { AtBatResult } from '../batting/types'
import type { HitResultDetail } from '../defence/types'
import type { Runners } from './types'
import type { GameEvent } from './types'
import {
  BASE_POS,
  euclidDist,
  resolveThrow,
  calcRemainingTo2B,
  calcRelayPos,
  selectRelayMan,
  shouldUseRelay,
  resolveRelayThrow,
} from '../defence/throw-judge'
import type { BallState, BaseKey } from '../defence/throw-judge'
import { FIELDER_DEFAULT_POS } from '../defence/fielder-positions'
import {
  decideChallengeAdvance,
  decideThrowTarget,
  resolveSecondaryThrow,
  getReceiverAtBase,
} from '../defence/runner-decision'
import { GAME_CONFIG, LINE_DRIVE_THRESHOLD } from './config'
import type { FieldersChoiceRule } from './config'

// ============================================================
// RunnerMove — 주자 이동 내역 (GameEvent runner_advance payload용)
// ============================================================

export interface RunnerMove {
  runner:          Player
  from:            1 | 2 | 3 | 'batter'
  to:              1 | 2 | 3 | 'home'
  wasOut?:         boolean  // 진루 중 아웃된 경우 — derive-state에서 도착 베이스를 점유하지 않음
  return_penalty?: number   // 예약: 귀루 중 주자 (#4/#5에서 활용)
}

export interface AdvanceResult {
  nextRunners: Runners
  runsScored:  number
  outs_added:  number    // 송구 판정 아웃 (주자가 진루 시도 중 잡힘)
  moves:       RunnerMove[]
  events:      GameEvent[]  // secondary_throw 등 추가 이벤트 (inning/isTop은 호출자가 패치)
}

// ============================================================
// StealState — 도루 중 타격 발생 시 주자 위치 보정용
// ============================================================

export interface StealState {
  runner:      Player
  base:        1 | 2     // 도루 출발 베이스
  t_steal_run: number    // 도루 진행 시간 (고정 근사: 1.8s)
}

// ============================================================
// 내부 유틸
// ============================================================

function getFielderPos(hp: HitResultDetail): { x: number; y: number } {
  return hp.fielder_pos ?? FIELDER_DEFAULT_POS[hp.fielder.position_1] ?? { x: 0, y: 88 }
}

// ============================================================
// calcRunnerSpeed — 주자 속도 (m/s)
// ============================================================

function calcRunnerSpeed(runner: Player): number {
  return 5.0 + (runner.stats.running / 100) * 3.0
}

// ============================================================
// calcPitchLead / calcRunnerDist — 주자 목표 베이스까지 남은 거리
// ============================================================

function calcPitchLead(runner: Player): number {
  const static_lead = 1.5 + (runner.stats.running / 100) * 1.5
  return static_lead * 2.0
}

function calcRunnerDist(
  runner:     Player,
  fromBase:   1 | 2 | 3,
  targetKey:  keyof typeof BASE_POS,
  stealState?: StealState,
): number {
  const fromKey = fromBase === 1 ? '1B' : fromBase === 2 ? '2B' : '3B'
  const full_dist = euclidDist(BASE_POS[fromKey], BASE_POS[targetKey])

  if (stealState && stealState.runner.id === runner.id && stealState.base === fromBase) {
    const runner_speed   = calcRunnerSpeed(runner)
    const steal_progress = runner_speed * stealState.t_steal_run
    return Math.max(0, full_dist - steal_progress)
  }

  return Math.max(0, full_dist - calcPitchLead(runner))
}

// ============================================================
// baseNumToKey / baseKeyToNum / getNextBase — BaseKey 변환 유틸
// ============================================================

function baseNumToKey(base: 1 | 2 | 3): BaseKey {
  if (base === 1) return '1B'
  if (base === 2) return '2B'
  return '3B'
}

function getNextBase(base: BaseKey): BaseKey | null {
  const order: BaseKey[] = ['1B', '2B', '3B', 'home']
  const idx = order.indexOf(base)
  if (idx === -1 || idx >= order.length - 1) return null
  return order[idx + 1]
}

// ============================================================
// adjustBallState — runner 이동 시간만큼 BallState t_remaining 차감
//
// fielding/in_air: t_remaining이 0이 되면 'held'로 전환
// throw_in_flight: t_remaining이 0이 되면 receiver가 공을 받아 'held'로 전환
// held: 변경 없음
// ============================================================

function adjustBallState(bs: BallState, t_elapsed: number): BallState {
  switch (bs.phase) {
    case 'in_air':
    case 'fielding': {
      const remaining = Math.max(0, bs.t_remaining - t_elapsed)
      if (remaining === 0) {
        return { phase: 'held', fielder: bs.fielder, fielder_pos: bs.fielder_pos }
      }
      return { ...bs, t_remaining: remaining }
    }
    case 'throw_in_flight': {
      const remaining = Math.max(0, bs.t_remaining - t_elapsed)
      if (remaining === 0) {
        return { phase: 'held', fielder: bs.receiver, fielder_pos: bs.receiver_pos }
      }
      return { ...bs, t_remaining: remaining }
    }
    case 'held':
      return bs
  }
}

// ============================================================
// findRunnerTarget — 주자가 도달할 수 있는 최종 베이스 탐색
//
// 베이스를 하나씩 늘려가며 decideChallengeAdvance를 호출.
// 각 단계에서 BallState.t_remaining을 runner 이동 시간만큼 차감하여 전달.
//
// occupiedBases: 정지 주자의 베이스 (충돌 방지)
// attemptedBases: 도전 주자의 목표 베이스 (home 제외)
// forceMinBase: 이 베이스까지는 decideChallengeAdvance 결과와 무관하게 강제 진루
// ============================================================

const BASE_ORDER: BaseKey[] = ['1B', '2B', '3B', 'home']

function findRunnerTarget(
  runner:         Player,
  fromBase:       1 | 2 | 3,
  initial_bs:     BallState,
  stealState:     StealState | undefined,
  lineup:         Player[],
  occupiedBases:  Set<BaseKey>,
  attemptedBases: Set<BaseKey>,
  forceMinBase?:  BaseKey,
): { targetBase: BaseKey; runner_dist: number; t_arrival: number } | null {
  const fromKey = baseNumToKey(fromBase)
  const startIdx = BASE_ORDER.indexOf(fromKey)
  const runner_speed = calcRunnerSpeed(runner)

  let accumulated_t = 0
  let last_confirmed: { targetBase: BaseKey; runner_dist: number; t_arrival: number } | null = null

  for (let i = startIdx + 1; i < BASE_ORDER.length; i++) {
    const nextKey = BASE_ORDER[i]

    // forceMinBase 구간 내에서는 충돌 체크를 건너뜀
    // (포스 플레이 등으로 해당 베이스까지는 강제 진루가 필요한 경우)
    const belowForceMin =
      forceMinBase !== undefined &&
      BASE_ORDER.indexOf(nextKey) <= BASE_ORDER.indexOf(forceMinBase) &&
      (last_confirmed === null ||
       BASE_ORDER.indexOf(last_confirmed.targetBase) < BASE_ORDER.indexOf(forceMinBase))

    // 충돌 방지: home은 항상 허용, 강제 구간은 건너뜀
    if (!belowForceMin && nextKey !== 'home' && (occupiedBases.has(nextKey) || attemptedBases.has(nextKey))) {
      break
    }

    // 이 단계의 출발점 → 목표 거리 계산
    let runner_dist: number
    if (i === startIdx + 1) {
      // 첫 단계: calcRunnerDist (도루 상태 + secondary lead 반영)
      runner_dist = calcRunnerDist(runner, fromBase, nextKey, stealState)
    } else {
      // 후속 단계: 이미 이동 중, 두 베이스 간 직선 거리
      const currentKey = BASE_ORDER[i - 1]
      runner_dist = euclidDist(BASE_POS[currentKey], BASE_POS[nextKey])
    }

    const t_to_next   = runner_dist / runner_speed
    const adjusted_bs = adjustBallState(initial_bs, accumulated_t)

    // 진루 여부 결정
    const willChallenge = decideChallengeAdvance(runner, runner_dist, adjusted_bs, nextKey, lineup)

    // 최소 진루 강제: forceMinBase에 아직 도달하지 않은 구간이면 강제 진루
    const isForced =
      forceMinBase !== undefined &&
      BASE_ORDER.indexOf(nextKey) <= BASE_ORDER.indexOf(forceMinBase) &&
      (last_confirmed === null ||
       BASE_ORDER.indexOf(last_confirmed.targetBase) < BASE_ORDER.indexOf(forceMinBase))

    if (willChallenge || isForced) {
      accumulated_t += t_to_next
      last_confirmed = { targetBase: nextKey, runner_dist, t_arrival: accumulated_t }
    } else {
      break
    }
  }

  return last_confirmed
}

// ============================================================
// resolveLDDoublePlay — 라인 드라이브 직접 포구 시 귀루 아웃 판정
//
// 발동 조건: result='out', !is_infield, t_ball_travel < LINE_DRIVE_THRESHOLD
// 타자 아웃(atBatOut=1)은 at-bat.ts가 담당 — 여기서는 주자 귀루 아웃만 처리
// ============================================================

function resolveLDDoublePlay(
  runners:        Runners,
  batter:         Player,
  hp:             HitResultDetail,
  defenceLineup:  Player[],
  inningCtx?:     { inning: number; isTop: boolean },
): AdvanceResult {
  const fielder_pos   = getFielderPos(hp)
  const reaction_delay = hp.catch_setup_time ?? 0.2
  const spd_OF        = (80 + hp.fielder.stats.throw * 0.7) / 3.6

  let nextRunners: Runners = { ...runners }
  let outs_added  = 0
  const moves:  RunnerMove[]  = []
  const events: GameEvent[]   = []

  const runnerEntries: Array<[1 | 2 | 3, Player | null, BaseKey]> = [
    [3, runners.third,  '3B'],
    [2, runners.second, '2B'],
    [1, runners.first,  '1B'],
  ]

  for (const [fromBase, runner, baseKey] of runnerEntries) {
    if (!runner) continue

    const lead_dist   = calcPitchLead(runner)
    const runner_speed = calcRunnerSpeed(runner)
    const return_time  = lead_dist / runner_speed

    // 수비수 → 루 결정론적 송구 시간 (난수 없음)
    const throw_dist  = euclidDist(fielder_pos, BASE_POS[baseKey])
    const throw_time  = reaction_delay + throw_dist / spd_OF

    if (return_time > throw_time) {
      // 귀루 아웃
      outs_added++
      if (fromBase === 1) nextRunners.first  = null
      if (fromBase === 2) nextRunners.second = null
      if (fromBase === 3) nextRunners.third  = null
      moves.push({ runner, from: fromBase, to: fromBase })
    }
    // 귀루 성공 → 현재 베이스 유지 (nextRunners 변경 없음)
  }

  // 타자는 아웃이므로 1루에 배치하지 않음
  return { nextRunners, runsScored: 0, outs_added, moves, events }
}

// ============================================================
// resolveOutfieldFlyOut — 외야 플라이아웃 태그업 판정
//
// 발동 조건: result='out', !is_infield, t_ball_travel >= LINE_DRIVE_THRESHOLD, outs < 2
// 2아웃은 타구 즉시 진루 원칙이므로 호출하지 않음 (advanceRunners에서 필터링)
// ============================================================

function resolveOutfieldFlyOut(
  runners:        Runners,
  batter:         Player,
  hp:             HitResultDetail,
  defenceLineup:  Player[],
  scoreContext?:  { battingScore: number; defenseScore: number },
  inningCtx?:     { inning: number; isTop: boolean },
  outs?:          number,
): AdvanceResult {
  const lineup       = defenceLineup
  const fielder_pos  = getFielderPos(hp)
  const reaction_delay = hp.catch_setup_time ?? 0.2

  // 포구 완료 상태 — 외야수가 공을 쥐고 있음
  const ball_state: BallState = {
    phase:       'held',
    fielder:     hp.fielder,
    fielder_pos,
  }
  // 포구 후 준비 시간만큼 경과한 BallState
  const adjusted_bs = adjustBallState(ball_state, reaction_delay)

  let nextRunners: Runners = { ...runners }
  let runsScored  = 0
  let outs_added  = 0
  const moves:  RunnerMove[]  = []
  const events: GameEvent[]   = []

  // 앞 주자 우선 처리 (3루 → 2루 → 1루)
  const runnerEntries: Array<[1 | 2 | 3, Player | null]> = [
    [3, runners.third],
    [2, runners.second],
    [1, runners.first],
  ]

  for (const [fromBase, runner] of runnerEntries) {
    if (!runner) continue

    const fromKey   = baseNumToKey(fromBase)
    const nextKey   = getNextBase(fromKey)
    if (!nextKey) continue

    const toNum: 1 | 2 | 3 | 'home' =
      nextKey === '1B' ? 1 :
      nextKey === '2B' ? 2 :
      nextKey === '3B' ? 3 : 'home'

    const lead_dist   = calcPitchLead(runner)
    const full_dist   = euclidDist(BASE_POS[fromKey], BASE_POS[nextKey])
    // 귀루 거리를 더해 decideChallengeAdvance에서 자연스럽게 불리하게 작용
    const runner_dist = full_dist + lead_dist

    const willChallenge = decideChallengeAdvance(runner, runner_dist, adjusted_bs, nextKey, lineup)

    const inning = inningCtx?.inning ?? 0
    const isTop  = inningCtx?.isTop  ?? false

    if (!willChallenge) {
      // 태그업 포기 — 현재 베이스 유지 (nextRunners 변경 없음)
      continue
    }

    // 태그업 시도 → 송구 판정
    const throw_dist = euclidDist(fielder_pos, BASE_POS[nextKey])
    const verdict    = resolveThrow(hp.fielder, throw_dist, reaction_delay, runner, runner_dist)

    events.push({
      type: 'tag_up',
      inning,
      isTop,
      payload: { runner, from: fromBase, to: toNum, safe: verdict !== 'out' },
    })

    if (verdict === 'safe') {
      if (fromBase === 1) nextRunners.first  = null
      if (fromBase === 2) nextRunners.second = null
      if (fromBase === 3) nextRunners.third  = null

      if (nextKey === 'home') {
        runsScored++
      } else {
        if (nextKey === '1B') nextRunners.first  = runner
        if (nextKey === '2B') nextRunners.second = runner
        if (nextKey === '3B') nextRunners.third  = runner
      }
      moves.push({ runner, from: fromBase, to: toNum })
    } else if (verdict === 'wild_throw') {
      // 폭투: nextKey 통과 + extra 1베이스
      if (fromBase === 1) nextRunners.first  = null
      if (fromBase === 2) nextRunners.second = null
      if (fromBase === 3) nextRunners.third  = null

      const extraBase  = getNextBase(nextKey)
      const finalBase  = extraBase ?? 'home'
      const finalToNum: 1 | 2 | 3 | 'home' =
        finalBase === '1B' ? 1 : finalBase === '2B' ? 2 : finalBase === '3B' ? 3 : 'home'

      events.push({
        type:    'throwing_error',
        inning,
        isTop,
        payload: { thrower: hp.fielder, runner, to: nextKey, extra_base: finalBase },
      })

      if (finalBase === 'home') {
        runsScored++
      } else {
        if (finalBase === '1B') nextRunners.first  = runner
        if (finalBase === '2B') nextRunners.second = runner
        if (finalBase === '3B') nextRunners.third  = runner
      }
      moves.push({ runner, from: fromBase, to: finalToNum })
    } else {
      // 태그업 아웃
      if (fromBase === 1) nextRunners.first  = null
      if (fromBase === 2) nextRunners.second = null
      if (fromBase === 3) nextRunners.third  = null
      outs_added++
      moves.push({ runner, from: fromBase, to: toNum })

      // outs === 1 이고 이 귀루 아웃이 3번째 아웃 → 이후 진루 처리 중단
      if ((outs ?? 0) === 1) break
    }
  }

  // 희생플라이: 득점 발생 시 타자에게 SAC F 기록
  if (runsScored > 0) {
    events.push({
      type:    'sac_fly',
      inning:  inningCtx?.inning ?? 0,
      isTop:   inningCtx?.isTop  ?? false,
      payload: { batter },
    })
  }

  // 타자는 아웃이므로 1루에 배치하지 않음
  return { nextRunners, runsScored, outs_added, moves, events }
}

// ============================================================
// resolveRunnerAdvances — 모든 주자의 진루를 독립적으로 판정
//
// 기존 resolveLeadingRunner 대체.
// 1. 초기 BallState 구성
// 2. 각 주자의 최종 목표 결정 (3B → 2B → 1B 순)
// 3. isCritical 계산
// 4. decideThrowTarget으로 송구 방향 결정
// 5. 주 타깃 주자: 실제 송구 판정
// 6. 비 타깃 주자: 무혈 진루 → 재도전 여부 판단 (2차 송구)
// ============================================================

function resolveRunnerAdvances(
  result:         'single' | 'double',
  runners:        Runners,
  hp:             HitResultDetail,
  stealState?:    StealState,
  defenceLineup?: Player[],
  scoreContext?:  { battingScore: number; defenseScore: number },
  inningCtx?:     { inning: number; isTop: boolean },
): { nextRunners: Runners; runsScored: number; outs_added: number; moves: RunnerMove[]; events: GameEvent[] } {
  const lineup      = defenceLineup ?? []
  const fielder_pos = getFielderPos(hp)
  const fielder     = hp.fielder

  // 초기 BallState: 수비수가 포구 중 (t_fielding초 후 공을 잡음)
  const initial_bs: BallState = {
    phase:       'fielding',
    t_remaining: hp.t_fielding,
    fielder_pos,
    fielder,
  }

  // 정지 주자 베이스 집합 (충돌 방지)
  const occupiedBases  = new Set<BaseKey>()
  // 도전 주자 목표 베이스 집합 (home 제외)
  const attemptedBases = new Set<BaseKey>()

  type RunnerAttempt = {
    runner:      Player
    fromBase:    1 | 2 | 3
    targetBase:  BaseKey
    runner_dist: number
    t_arrival:   number
  }

  const attempts: RunnerAttempt[] = []

  // 3B → 2B → 1B 순서로 처리 (가장 앞선 주자 우선)
  const runnerEntries: Array<[1 | 2 | 3, Player | null]> = [
    [3, runners.third],
    [2, runners.second],
    [1, runners.first],
  ]

  for (const [fromBase, runner] of runnerEntries) {
    if (!runner) continue

    // 최소 진루 강제 설정 (포스 플레이 체인)
    // 단타: 1루→2루 강제, 1·2루→각각 2루·3루 강제, 만루→3루 주자도 홈 강제
    // 2루타: 1루→2루 강제, 2루→3루 강제
    let forceMinBase: BaseKey | undefined
    if (result === 'single') {
      if (fromBase === 3 && runners.second !== null && runners.first !== null) {
        forceMinBase = 'home'  // 만루: 3루 주자 홈 강제
      } else if (fromBase === 2 && runners.first !== null) {
        forceMinBase = '3B'    // 1·2루: 2루 주자 3루 강제
      } else if (fromBase === 1) {
        forceMinBase = '2B'    // 1루 주자 2루 강제 (타자가 1루 점유)
      }
    } else if (result === 'double') {
      if (fromBase === 1) forceMinBase = '2B'
      if (fromBase === 2) forceMinBase = '3B'
    }

    const found = findRunnerTarget(
      runner, fromBase, initial_bs, stealState, lineup,
      occupiedBases, attemptedBases, forceMinBase,
    )

    if (!found) {
      // 진루 안 함 (forceMinBase 없는 경우만 발생, 현재 로직상 히트 시엔 거의 불가)
      const stayKey = baseNumToKey(fromBase)
      occupiedBases.add(stayKey)
      // stays 처리: attempts에 "stay-in-place" 로 넣지 않고 별도 처리 필요
      // → 현재 위치 유지 (occupiedBases에 추가됨, 진루 없음)
    } else {
      // 도전 주자
      if (found.targetBase !== 'home') {
        attemptedBases.add(found.targetBase)
      }
      attempts.push({ runner, fromBase, ...found })
    }
  }

  // ── isCritical 계산 ────────────────────────────────────────
  const isCritical =
    scoreContext !== undefined &&
    attempts.some(a => a.targetBase === 'home') &&
    (scoreContext.battingScore + 1 >= scoreContext.defenseScore)

  // ── 송구 방향 결정 ──────────────────────────────────────────
  const chosenTarget: BaseKey | null = attempts.length > 0
    ? decideThrowTarget(
        fielder,
        attempts.map(a => ({ runner: a.runner, target: a.targetBase, runner_dist: a.runner_dist })),
        initial_bs,
        isCritical,
        lineup,
      )
    : null

  // ── t_first_throw 계산 (1차 송구 완료까지 총 시간) ──────────
  let t_first_throw = hp.t_fielding
  if (chosenTarget !== null) {
    const spd_OF   = (80 + fielder.stats.throw * 0.7) / 3.6
    const targetPos = BASE_POS[chosenTarget]
    const relayMan  = selectRelayMan(fielder_pos, lineup)
    const relayPos  = calcRelayPos(fielder_pos, targetPos)
    const useRelay  = shouldUseRelay(fielder, fielder_pos, targetPos, hp.t_fielding, relayMan, relayPos)

    if (useRelay) {
      const spd_relay = (80 + relayMan.stats.throw * 0.7) / 3.6
      t_first_throw   = hp.t_fielding
        + euclidDist(fielder_pos, relayPos)   / spd_OF
        + 0.8
        + euclidDist(relayPos,  targetPos)    / spd_relay
    } else {
      t_first_throw = hp.t_fielding + euclidDist(fielder_pos, targetPos) / spd_OF
    }
  }

  // ── 결과 집계 ────────────────────────────────────────────────
  let nextRunners: Runners = { first: null, second: null, third: null }
  let runsScored  = 0
  let outs_added  = 0
  const moves:  RunnerMove[]  = []
  const events: GameEvent[]   = []

  // 정지 주자 처리 (occupiedBases에 추가된 주자들)
  // findRunnerTarget이 null을 반환한 주자는 현재 베이스에 그대로
  for (const [fromBase, runner] of runnerEntries) {
    if (!runner) continue
    if (attempts.some(a => a.runner.id === runner.id)) continue  // 도전 주자는 아래에서 처리

    const stayKey = baseNumToKey(fromBase)
    if (stayKey === '1B') nextRunners.first  = runner
    if (stayKey === '2B') nextRunners.second = runner
    if (stayKey === '3B') nextRunners.third  = runner
    // 이동 없음 (moves에 추가 안 함)
  }

  // 주 타깃 주자 처리용 내부 throwVerdict
  function throwVerdictForTarget(runner: Player, runner_dist: number, targetBase: BaseKey): 'safe' | 'out' | 'wild_throw' {
    const targetPos  = BASE_POS[targetBase]
    const throw_dist = euclidDist(fielder_pos, targetPos)
    const relayMan   = selectRelayMan(fielder_pos, lineup)
    const relayPos   = calcRelayPos(fielder_pos, targetPos)
    const useRelay   = shouldUseRelay(fielder, fielder_pos, targetPos, hp.t_fielding, relayMan, relayPos)

    return useRelay
      ? resolveRelayThrow(fielder, fielder_pos, relayMan, targetPos, hp.t_fielding, runner, runner_dist)
      : resolveThrow(fielder, throw_dist, hp.t_fielding, runner, runner_dist)
  }

  // wild_throw 처리 헬퍼 — 주자를 목표 베이스 + 1로 이동
  function applyWildThrow(
    runner:     Player,
    fromNum:    1 | 2 | 3 | 'batter',
    targetBase: BaseKey,
  ): void {
    const extraBase  = getNextBase(targetBase)
    const finalBase  = extraBase ?? 'home'
    const finalToNum: 1 | 2 | 3 | 'home' =
      finalBase === '1B' ? 1 : finalBase === '2B' ? 2 : finalBase === '3B' ? 3 : 'home'

    events.push({
      type:    'throwing_error',
      inning:  inningCtx?.inning ?? 0,
      isTop:   inningCtx?.isTop  ?? false,
      payload: { thrower: fielder, runner, to: targetBase, extra_base: finalBase },
    })

    if (finalBase === 'home') {
      runsScored++
    } else {
      if (finalBase === '1B') nextRunners.first  = runner
      if (finalBase === '2B') nextRunners.second = runner
      if (finalBase === '3B') nextRunners.third  = runner
    }
    moves.push({ runner, from: fromNum, to: finalToNum })
  }

  // 도전 주자 처리
  for (const attempt of attempts) {
    const { runner, fromBase, targetBase, runner_dist, t_arrival } = attempt
    const fromNum: 1 | 2 | 3                  = fromBase
    const toNum:   1 | 2 | 3 | 'home'         =
      targetBase === '1B' ? 1 :
      targetBase === '2B' ? 2 :
      targetBase === '3B' ? 3 : 'home'

    if (chosenTarget !== null && targetBase === chosenTarget) {
      // ── 주 타깃 주자: 실제 송구 판정 ──────────────────────────
      const verdict = throwVerdictForTarget(runner, runner_dist, targetBase)

      if (verdict === 'out') {
        outs_added++
        moves.push({ runner, from: fromNum, to: toNum, wasOut: true })
        events.push({
          type:    'runner_out',
          inning:  inningCtx?.inning ?? 0,
          isTop:   inningCtx?.isTop  ?? false,
          payload: { runner, from: fromNum, to: toNum },
        })
      } else if (verdict === 'wild_throw') {
        // 폭투: 목표 베이스 안착 + extra 1베이스
        applyWildThrow(runner, fromNum, targetBase)
      } else {
        // Safe!
        if (targetBase === 'home') {
          runsScored++
        } else {
          if (targetBase === '1B') nextRunners.first  = runner
          if (targetBase === '2B') nextRunners.second = runner
          if (targetBase === '3B') nextRunners.third  = runner
        }
        moves.push({ runner, from: fromNum, to: toNum })
      }
    } else {
      // ── 비 타깃 주자: 무혈 진루 → 2차 도전 여부 판단 ──────────
      // 먼저 원래 목표 베이스로 무혈 진루
      if (targetBase === 'home') {
        runsScored++
        moves.push({ runner, from: fromNum, to: 'home' })
      } else {
        if (targetBase === '1B') nextRunners.first  = runner
        if (targetBase === '2B') nextRunners.second = runner
        if (targetBase === '3B') nextRunners.third  = runner
        moves.push({ runner, from: fromNum, to: toNum as 1 | 2 | 3 })
      }

      // 2차 도전: 다음 베이스 시도 (chosenTarget이 있는 경우만)
      if (chosenTarget === null || targetBase === 'home') continue

      const nextTarget = getNextBase(targetBase)
      if (nextTarget === null) continue

      // 주자가 목표에 도달했을 때의 BallState 계산
      let reBallState: BallState
      if (t_arrival < t_first_throw) {
        // 공이 아직 1차 목표로 날아가는 중
        const { player: recv, pos: recv_pos } = getReceiverAtBase(chosenTarget, lineup)
        reBallState = {
          phase:        'throw_in_flight',
          t_remaining:  t_first_throw - t_arrival,
          target:       chosenTarget,
          receiver_pos: recv_pos,
          receiver:     recv,
        }
      } else {
        // 1차 송구 완료 → 공은 수신자 손에
        const { player: recv, pos: recv_pos } = getReceiverAtBase(chosenTarget, lineup)
        reBallState = {
          phase:       'held',
          fielder:     recv,
          fielder_pos: recv_pos,
        }
      }

      const dist_to_next = euclidDist(BASE_POS[targetBase], BASE_POS[nextTarget])

      // 2차 도전 전 충돌 체크: 다음 베이스에 이미 다른 주자가 있으면 시도 불가
      const isNextOccupied =
        (nextTarget === '1B' && nextRunners.first  !== null) ||
        (nextTarget === '2B' && nextRunners.second !== null) ||
        (nextTarget === '3B' && nextRunners.third  !== null)

      if (!isNextOccupied && decideChallengeAdvance(runner, dist_to_next, reBallState, nextTarget, lineup)) {
        // 2차 도전!
        const { player: recv, pos: recv_pos } = getReceiverAtBase(chosenTarget, lineup)
        const secondaryVerdict = resolveSecondaryThrow(
          recv, recv_pos, nextTarget, Math.max(0, t_first_throw - t_arrival), runner, dist_to_next,
        )

        const nextToNum: 1 | 2 | 3 | 'home' =
          nextTarget === '1B' ? 1 :
          nextTarget === '2B' ? 2 :
          nextTarget === '3B' ? 3 : 'home'

        events.push({
          type:    'secondary_throw',
          inning:  inningCtx?.inning  ?? 0,
          isTop:   inningCtx?.isTop   ?? false,
          payload: {
            receiver:     recv,
            receiver_pos: recv_pos,
            target:       nextTarget,
            challenger:   runner,
            out:          secondaryVerdict === 'out',
          },
        })

        if (secondaryVerdict === 'out') {
          outs_added++
          if (targetBase === '1B') nextRunners.first  = null
          if (targetBase === '2B') nextRunners.second = null
          if (targetBase === '3B') nextRunners.third  = null
          const mi = moves.findIndex(m => m.runner.id === runner.id && m.to === toNum)
          if (mi >= 0) moves.splice(mi, 1)
          moves.push({ runner, from: fromNum, to: nextToNum, wasOut: true })
          events.push({
            type:    'runner_out',
            inning:  inningCtx?.inning ?? 0,
            isTop:   inningCtx?.isTop  ?? false,
            payload: { runner, from: fromNum, to: nextToNum },
          })
        } else if (secondaryVerdict === 'wild_throw') {
          // 2차 폭투: nextTarget + extra 1베이스
          if (targetBase === '1B') nextRunners.first  = null
          if (targetBase === '2B') nextRunners.second = null
          if (targetBase === '3B') nextRunners.third  = null
          const mi = moves.findIndex(m => m.runner.id === runner.id && m.to === toNum)
          if (mi >= 0) moves.splice(mi, 1)
          const extra    = getNextBase(nextTarget)
          const finalBase = extra ?? 'home'
          const finalToNum2: 1|2|3|'home' =
            finalBase === '1B' ? 1 : finalBase === '2B' ? 2 : finalBase === '3B' ? 3 : 'home'
          events.push({
            type:    'throwing_error',
            inning:  inningCtx?.inning ?? 0,
            isTop:   inningCtx?.isTop  ?? false,
            payload: { thrower: recv, runner, to: nextTarget, extra_base: finalBase },
          })
          if (finalBase === 'home') {
            runsScored++
          } else {
            if (finalBase === '1B') nextRunners.first  = runner
            if (finalBase === '2B') nextRunners.second = runner
            if (finalBase === '3B') nextRunners.third  = runner
          }
          moves.push({ runner, from: fromNum, to: finalToNum2 })
        } else {
          // 2차 도전 성공! 다음 베이스로 이동
          if (targetBase === '1B') nextRunners.first  = null
          if (targetBase === '2B') nextRunners.second = null
          if (targetBase === '3B') nextRunners.third  = null

          if (nextTarget === 'home') {
            runsScored++
          } else {
            if (nextTarget === '1B') nextRunners.first  = runner
            if (nextTarget === '2B') nextRunners.second = runner
            if (nextTarget === '3B') nextRunners.third  = runner
          }

          // 이동 기록 업데이트 (원래 목표 → 다음 목표로 변경)
          const mi = moves.findIndex(m => m.runner.id === runner.id && m.to === toNum)
          if (mi >= 0) {
            moves[mi] = { runner, from: fromNum, to: nextToNum }
          }
        }
      }
    }
  }

  return { nextRunners, runsScored, outs_added, moves, events }
}

// ============================================================
// resolveBatterAdvance — 타자 추가 진루 독립 판정 (가상 2루 송구)
// ============================================================

function resolveBatterAdvance(batter: Player, hp: HitResultDetail): 1 | 2 {
  if (hp.is_infield) return 1

  const fielder_pos  = getFielderPos(hp)
  const throw_dist   = euclidDist(fielder_pos, BASE_POS['2B'])
  const runner_dist  = calcRemainingTo2B(hp.t_ball_travel, batter)
  const verdict      = resolveThrow(hp.fielder, throw_dist, hp.t_fielding, batter, runner_dist)
  return (verdict === 'safe' || verdict === 'wild_throw') ? 2 : 1
}

// ============================================================
// advanceRunners — 안타 종류별 주자 이동 (공개 엔트리 포인트)
//
// hitPhysics 없으면 기존 고정 룰 fallback (backward compat 유지)
// scoreContext: isCritical 판단용 (없으면 isCritical = false)
// ============================================================

export function advanceRunners(
  result:         AtBatResult,
  runners:        Runners,
  batter:         Player,
  hitPhysics?:    HitResultDetail,
  stealState?:    StealState,
  defenceLineup?: Player[],
  scoreContext?:  { battingScore: number; defenseScore: number },
  inningCtx?:     { inning: number; isTop: boolean },
  outs?:          number,
): AdvanceResult {
  if (result === 'walk' || result === 'hit_by_pitch') {
    return forceAdvance(runners, batter)
  }

  // 실책 출루 → single과 동일 경로 (기존 주자 진루 + 타자 1루)
  if (result === 'reach_on_error') {
    return advanceRunners('single', runners, batter, hitPhysics, stealState,
      defenceLineup, scoreContext, inningCtx, outs)
  }

  // 내야 그라운더 아웃 → 병살/야수선택/포스아웃 처리
  if (result === 'out' && hitPhysics?.is_infield) {
    return resolveInfieldOut(
      runners, batter, hitPhysics, outs ?? 0,
      defenceLineup, inningCtx,
      GAME_CONFIG.fielders_choice_rule,
    )
  }

  // 외야 아웃 분기 (태그업 / 라인 드라이브 귀루 아웃)
  if (result === 'out' && hitPhysics && !hitPhysics.is_infield) {
    const lineup = defenceLineup ?? []
    if (hitPhysics.t_ball_travel < LINE_DRIVE_THRESHOLD) {
      // 라인 드라이브 직접 포구: 귀루 시간 vs 송구 시간 비교
      return resolveLDDoublePlay(runners, batter, hitPhysics, lineup, inningCtx)
    } else if ((outs ?? 0) < 2) {
      // 0~1아웃 외야 플라이아웃: 태그업
      // 2아웃은 타구 즉시 주자가 달리므로 태그업 없음 → fixedAdvance로 fall-through
      return resolveOutfieldFlyOut(runners, batter, hitPhysics, lineup, scoreContext, inningCtx, outs)
    }
    // 2아웃 외야 플라이아웃 → fixedAdvance로 fall-through (3번째 아웃, 주자 정리)
  }

  if (!hitPhysics || result === 'strikeout' || result === 'out' ||
      result === 'home_run' || result === 'triple') {
    return fixedAdvance(result, runners, batter)
  }

  const moves: RunnerMove[] = []
  const allEvents: GameEvent[] = []
  let runsScored = 0
  let outs_added = 0
  let next: Runners = { first: null, second: null, third: null }

  if (result === 'single') {
    // resolveRunnerAdvances로 기존 주자 전원 처리
    const adv = resolveRunnerAdvances('single', runners, hitPhysics, stealState, defenceLineup, scoreContext, inningCtx)
    runsScored += adv.runsScored
    outs_added += adv.outs_added
    moves.push(...adv.moves)
    allEvents.push(...adv.events)
    next = { ...next, ...adv.nextRunners }

    // 타자 추가 진루 판정 (독립 평가)
    const batterBase = resolveBatterAdvance(batter, hitPhysics)
    if (batterBase === 2 && next.second === null) {
      next.second = batter
      moves.push({ runner: batter, from: 'batter', to: 2 })
    } else {
      next.first = batter
      moves.push({ runner: batter, from: 'batter', to: 1 })
    }

  } else if (result === 'double') {
    // resolveRunnerAdvances로 기존 주자 전원 처리
    const adv = resolveRunnerAdvances('double', runners, hitPhysics, stealState, defenceLineup, scoreContext, inningCtx)
    runsScored += adv.runsScored
    outs_added += adv.outs_added
    moves.push(...adv.moves)
    allEvents.push(...adv.events)
    next = { ...next, ...adv.nextRunners }

    // 타자는 2루타이므로 반드시 2루에 배치
    // forceMinBase로 인해 2루가 점유된 경우, 카스케이드 밀어냄:
    //   3루 주자가 있으면 먼저 홈으로 → 2루 주자 3루로 → 타자 2루
    if (next.second !== null) {
      const runner2B = next.second
      next.second = null

      if (next.third !== null) {
        // 3루 주자도 있으면 홈으로 밀어냄
        const runner3B = next.third
        next.third = null
        runsScored++
        const mi3 = moves.findIndex(m => m.runner.id === runner3B.id)
        if (mi3 >= 0) {
          moves[mi3] = { ...moves[mi3], to: 'home' }
        } else {
          moves.push({ runner: runner3B, from: 3, to: 'home' })
        }
      }

      // 2루 주자 → 3루
      next.third = runner2B
      const mi2 = moves.findIndex(m => m.runner.id === runner2B.id)
      if (mi2 >= 0) {
        moves[mi2] = { ...moves[mi2], to: 3 }
      } else {
        moves.push({ runner: runner2B, from: 2, to: 3 })
      }
    }
    next.second = batter
    moves.push({ runner: batter, from: 'batter', to: 2 })
  }

  return { nextRunners: next, runsScored, outs_added, moves, events: allEvents }
}

// ============================================================
// fixedAdvance — hitPhysics 없는 경로의 고정 룰 fallback
// ============================================================

function fixedAdvance(
  result:  AtBatResult,
  runners: Runners,
  batter:  Player,
): AdvanceResult {
  const moves: RunnerMove[] = []
  let runsScored = 0
  let next: Runners = { first: null, second: null, third: null }

  const advance = (runner: Player | null, from: 1 | 2 | 3, bases: number) => {
    if (!runner) return
    const dest = from + bases
    if (dest >= 4) {
      runsScored++
      moves.push({ runner, from, to: 'home' })
    } else {
      const to = dest as 1 | 2 | 3
      if (to === 1) next.first  = runner
      if (to === 2) next.second = runner
      if (to === 3) next.third  = runner
      moves.push({ runner, from, to })
    }
  }

  switch (result) {
    case 'single':
      advance(runners.third,  3, 1)
      advance(runners.second, 2, 1)
      advance(runners.first,  1, 1)
      next.first = batter
      moves.push({ runner: batter, from: 'batter', to: 1 })
      break

    case 'double':
      advance(runners.third,  3, 1)
      advance(runners.second, 2, 2)
      advance(runners.first,  1, 2)
      next.second = batter
      moves.push({ runner: batter, from: 'batter', to: 2 })
      break

    case 'triple':
      advance(runners.third,  3, 1)
      advance(runners.second, 2, 2)
      advance(runners.first,  1, 3)
      next.third = batter
      moves.push({ runner: batter, from: 'batter', to: 3 })
      break

    case 'home_run':
      if (runners.third)  { runsScored++; moves.push({ runner: runners.third,  from: 3, to: 'home' }) }
      if (runners.second) { runsScored++; moves.push({ runner: runners.second, from: 2, to: 'home' }) }
      if (runners.first)  { runsScored++; moves.push({ runner: runners.first,  from: 1, to: 'home' }) }
      runsScored++
      moves.push({ runner: batter, from: 'batter', to: 'home' })
      break

    default:
      break
  }

  return { nextRunners: next, runsScored, outs_added: 0, moves, events: [] }
}

// ============================================================
// resolveInfieldOut — 내야 그라운더 아웃 처리
//
// 1. 포스 상황 감지 → 포스 주자 전원 아웃
// 2. 3루 주자(비포스) 홈 도전 판단
// 3. 병살 판정 (피벗 맨 → 1루 송구 vs 타자 도달 시간)
// ============================================================

type PivotInfo = {
  forceRunners: Array<{ runner: Player; from: 1 | 2 | 3; to: 2 | 3 | 'home' }>
  pivotBase:    2 | 3 | 'home'
}

function detectPivotBase(runners: Runners): PivotInfo | null {
  // 포스 발생 조건: 1루 주자가 있어야 함 (타자가 1루를 차지하므로)
  if (!runners.first) return null

  const forceRunners: PivotInfo['forceRunners'] = []

  // 포스 주자 목록 구성 (1루→2루는 항상, 연쇄 포스 처리)
  forceRunners.push({ runner: runners.first, from: 1, to: 2 })
  if (runners.second) {
    forceRunners.push({ runner: runners.second, from: 2, to: 3 })
    if (runners.third) {
      forceRunners.push({ runner: runners.third, from: 3, to: 'home' })
    }
  }

  // pivotBase: 병살에 가장 유리한 베이스 (2루 우선 — 2루→1루가 가장 짧은 DP 경로)
  return { forceRunners, pivotBase: 2 }
}

function decide3BRunnerHome(
  runner:        Player,
  initial_bs:    BallState,
  outs:          number,
  forceOutCount: number,
  defenceLineup: Player[],
): boolean {
  // 포스아웃 후 실질 2아웃이면 무조건 홈 도전
  if (outs + forceOutCount >= 2) return true

  const dist = euclidDist(BASE_POS['3B'], BASE_POS['home'])
  return decideChallengeAdvance(runner, dist, initial_bs, 'home', defenceLineup)
}

function resolveInfieldOut(
  runners:       Runners,
  batter:        Player,
  hp:            HitResultDetail,
  outs:          number,
  defenceLineup: Player[] | undefined,
  inningCtx:     { inning: number; isTop: boolean } | undefined,
  fcRule:        FieldersChoiceRule,
): AdvanceResult {
  const lineup  = defenceLineup ?? []
  const moves:  RunnerMove[] = []
  const events: GameEvent[]  = []
  let next:     Runners      = { first: null, second: null, third: null }
  let outs_added = 0
  let runsScored = 0

  // 1. 포스 감지
  const pivot = detectPivotBase(runners)

  if (!pivot) {
    // 포스 없음 → 타자만 아웃, 주자 이동 없음 (기존 동작 유지)
    next = { ...runners }
    return { nextRunners: next, runsScored: 0, outs_added: 0, moves, events }
  }

  // 2. 포스 주자 전원 아웃 처리
  const isForceRunner = (fromBase: 1 | 2 | 3) =>
    pivot.forceRunners.some(f => f.from === fromBase)

  for (const fo of pivot.forceRunners) {
    outs_added++
    moves.push({ runner: fo.runner, from: fo.from, to: fo.to === 'home' ? 'home' : fo.to })
    events.push({
      type:    'force_out',
      inning:  inningCtx?.inning ?? 0,
      isTop:   inningCtx?.isTop  ?? false,
      payload: { runner: fo.runner, from: fo.from, to: fo.to },
    })
    if (fo.to === 'home') runsScored++
  }

  // 3. 비포스 주자 처리
  // 3루 주자가 포스 대상이 아닌 경우 홈 도전 판단
  if (!isForceRunner(3) && runners.third) {
    const initial_bs: BallState = {
      phase:       'fielding',
      t_remaining: hp.t_fielding,
      fielder_pos: hp.fielder_pos,
      fielder:     hp.fielder,
    }
    const goHome = decide3BRunnerHome(runners.third, initial_bs, outs, outs_added, lineup)
    if (goHome) {
      runsScored++
      moves.push({ runner: runners.third, from: 3, to: 'home' })
    } else {
      next.third = runners.third
    }
  }
  // 2루 주자가 비포스인 경우 제자리
  if (!isForceRunner(2) && runners.second) {
    next.second = runners.second
  }

  // 4. 병살 판정 (피벗 맨 → 1루 송구 vs 타자 도달 시간)
  const pivotKey = pivot.pivotBase === 2 ? '2B' : pivot.pivotBase === 3 ? '3B' : 'home'
  const pivotMan = getReceiverAtBase(pivotKey, lineup).player

  const pivot_pos        = BASE_POS[pivotKey]
  const throw_speed      = (80 + pivotMan.stats.throw * 0.7) / 3.6
  const throw_dist       = euclidDist(pivot_pos, BASE_POS['1B'])
  const pivot_throw_time = 0.3 + throw_dist / throw_speed

  const batter_run_speed = 5.0 + (batter.stats.running / 100) * 3.0
  const t_batter_to_1B   = 27.43 / batter_run_speed

  const isDP = t_batter_to_1B > pivot_throw_time

  if (isDP) {
    // 병살 성공: 타자도 아웃
    outs_added++
    moves.push({ runner: batter, from: 'batter', to: 1 })
  } else {
    // 타자 1루 세이프 (야수 선택)
    next.first = batter
    moves.push({ runner: batter, from: 'batter', to: 1 })
  }

  return { nextRunners: next, runsScored, outs_added, moves, events }
}

// ============================================================
// forceAdvance — 볼넷/사구 강제 진루
// ============================================================

function forceAdvance(runners: Runners, batter: Player): AdvanceResult {
  const moves: RunnerMove[] = []
  let runsScored = 0

  let third  = runners.third
  let second = runners.second
  let first  = runners.first

  if (first && second && third) {
    runsScored++
    moves.push({ runner: third,  from: 3, to: 'home' })
    third  = second
    moves.push({ runner: second, from: 2, to: 3 })
    second = first
    moves.push({ runner: first,  from: 1, to: 2 })
  } else if (first && second) {
    third  = second
    moves.push({ runner: second, from: 2, to: 3 })
    second = first
    moves.push({ runner: first,  from: 1, to: 2 })
  } else if (first) {
    second = first
    moves.push({ runner: first,  from: 1, to: 2 })
  }

  moves.push({ runner: batter, from: 'batter', to: 1 })

  return {
    nextRunners: { first: batter, second, third },
    runsScored,
    outs_added: 0,
    moves,
    events: [],
  }
}
