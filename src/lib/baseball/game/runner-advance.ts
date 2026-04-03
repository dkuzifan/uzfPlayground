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

// ============================================================
// RunnerMove — 주자 이동 내역 (GameEvent runner_advance payload용)
// ============================================================

export interface RunnerMove {
  runner:          Player
  from:            1 | 2 | 3 | 'batter'
  to:              1 | 2 | 3 | 'home'
  return_penalty?: number  // 예약: 귀루 중 주자 (#4/#5에서 활용)
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
    const runner_speed   = 5.0 + (runner.stats.running / 100) * 3.0
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
  const runner_speed = 5.0 + (runner.stats.running / 100) * 3.0

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

    // 최소 진루 강제 설정
    // 단타: 1루 주자는 포스 플레이 — 타자가 1루를 차지하므로 반드시 2루로 이동
    // 2루타: 물리 모델에 맡김 (외야 타구 특성상 decideChallengeAdvance가 자연스럽게 진루 결정)
    let forceMinBase: BaseKey | undefined
    if (result === 'single' && fromBase === 1) {
      forceMinBase = '2B'
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
  function throwVerdictForTarget(runner: Player, runner_dist: number, targetBase: BaseKey): 'safe' | 'out' {
    const targetPos  = BASE_POS[targetBase]
    const throw_dist = euclidDist(fielder_pos, targetPos)
    const relayMan   = selectRelayMan(fielder_pos, lineup)
    const relayPos   = calcRelayPos(fielder_pos, targetPos)
    const useRelay   = shouldUseRelay(fielder, fielder_pos, targetPos, hp.t_fielding, relayMan, relayPos)

    return useRelay
      ? resolveRelayThrow(fielder, fielder_pos, relayMan, targetPos, hp.t_fielding, runner, runner_dist)
      : resolveThrow(fielder, throw_dist, hp.t_fielding, runner, runner_dist)
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
        // moves에 아웃으로 기록 (to는 시도한 베이스)
        moves.push({ runner, from: fromNum, to: toNum })
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

      if (decideChallengeAdvance(runner, dist_to_next, reBallState, nextTarget, lineup)) {
        // 2차 도전!
        const { player: recv, pos: recv_pos } = getReceiverAtBase(chosenTarget, lineup)
        const secondaryVerdict = resolveSecondaryThrow(
          recv, recv_pos, nextTarget, t_first_throw, runner, dist_to_next,
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
          // nextRunners에서 제거 (원래 목표 베이스에서 아웃)
          if (targetBase === '1B') nextRunners.first  = null
          if (targetBase === '2B') nextRunners.second = null
          if (targetBase === '3B') nextRunners.third  = null
          // moves에서 이 주자의 이전 이동 제거 (아웃이므로)
          const mi = moves.findIndex(m => m.runner.id === runner.id && m.to === toNum)
          if (mi >= 0) moves.splice(mi, 1)
          moves.push({ runner, from: fromNum, to: nextToNum })
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
  return verdict === 'safe' ? 2 : 1
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
): AdvanceResult {
  if (result === 'walk' || result === 'hit_by_pitch') {
    return forceAdvance(runners, batter)
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

    // 타자 배치: 2루가 비어 있으면 2루, 점유됐으면 1루
    // (앞 주자가 2루에 머문 경우 — 극히 드물지만 앞 주자가 베이스 권리를 가짐)
    if (next.second === null) {
      next.second = batter
      moves.push({ runner: batter, from: 'batter', to: 2 })
    } else {
      next.first = batter
      moves.push({ runner: batter, from: 'batter', to: 1 })
    }
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
