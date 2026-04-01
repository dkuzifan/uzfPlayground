import type { Player } from '../types/player'
import type { AtBatResult } from '../batting/types'
import type { HitResultDetail } from '../defence/types'
import type { Runners } from './types'
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
import { FIELDER_DEFAULT_POS } from '../defence/fielder-positions'

// ============================================================
// RunnerMove — 주자 이동 내역 (GameEvent runner_advance payload용)
// ============================================================

export interface RunnerMove {
  runner: Player
  from:   1 | 2 | 3 | 'batter'
  to:     1 | 2 | 3 | 'home'
}

export interface AdvanceResult {
  nextRunners: Runners
  runsScored:  number
  outs_added:  number    // 송구 판정 아웃 (주자가 진루 시도 중 잡힘)
  moves:       RunnerMove[]
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
// calcRunnerDist — 주자의 목표 베이스까지 남은 거리
//
// 우선순위:
//   1. 도루 중 (stealState 일치): runner_speed × t_steal_run 만큼 이미 진행
//   2. 일반 베이스 대기: base_to_target - pitch_lead (세컨더리 리드)
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

  // 도루 중인 주자인지 확인
  if (stealState && stealState.runner.id === runner.id && stealState.base === fromBase) {
    const runner_speed   = 5.0 + (runner.stats.running / 100) * 3.0
    const steal_progress = runner_speed * stealState.t_steal_run
    return Math.max(0, full_dist - steal_progress)
  }

  // 일반: 세컨더리 리드 반영
  return Math.max(0, full_dist - calcPitchLead(runner))
}

// ============================================================
// resolveLeadingRunner — leading runner 여분 진루 판정 (실제 송구)
//
// 수비수는 가장 앞선 주자 베이스로 송구.
// 직접 송구 가능 여부와 중계 플레이 비교 후 최적 경로 선택.
// ============================================================

function resolveLeadingRunner(
  runners:        Runners,
  result:         'single' | 'double',
  hp:             HitResultDetail,
  stealState?:    StealState,
  defenceLineup?: Player[],
): { nextRunners: Runners; runsScored: number; outs_added: number; moves: RunnerMove[] } {
  const fielder_pos = getFielderPos(hp)
  const lineup      = defenceLineup ?? []
  let nextRunners = { ...runners }
  let runsScored  = 0
  let outs_added  = 0
  const moves: RunnerMove[] = []

  // ── 중계 판단 헬퍼 ──────────────────────────────────────────
  function throwVerdict(
    runner:      Player,
    runner_dist: number,
    targetKey:   keyof typeof BASE_POS,
  ): 'safe' | 'out' {
    const targetPos  = BASE_POS[targetKey]
    const throw_dist = euclidDist(fielder_pos, targetPos)
    const relayMan   = selectRelayMan(fielder_pos, lineup)
    const relayPos   = calcRelayPos(fielder_pos, targetPos)
    const useRelay   = shouldUseRelay(
      hp.fielder, fielder_pos, targetPos, hp.t_fielding, relayMan, relayPos,
    )
    return useRelay
      ? resolveRelayThrow(hp.fielder, fielder_pos, relayMan, targetPos, hp.t_fielding, runner, runner_dist)
      : resolveThrow(hp.fielder, throw_dist, hp.t_fielding, runner, runner_dist)
  }

  if (result === 'single') {
    // 2루 주자 → 홈 (우선)
    if (runners.second) {
      const runner      = runners.second
      const runner_dist = calcRunnerDist(runner, 2, 'home', stealState)
      const verdict     = throwVerdict(runner, runner_dist, 'home')
      if (verdict === 'safe') {
        runsScored++
        moves.push({ runner, from: 2, to: 'home' })
      } else {
        outs_added++
      }
      nextRunners.second = null
    } else if (runners.first) {
      // 1루 주자 → 3루 시도
      const runner      = runners.first
      const runner_dist = calcRunnerDist(runner, 1, '3B', stealState)
      const verdict     = throwVerdict(runner, runner_dist, '3B')
      if (verdict === 'safe') {
        nextRunners.third = runner
        moves.push({ runner, from: 1, to: 3 })
      } else {
        outs_added++
      }
      nextRunners.first = null
    }
  } else {
    // double: 1루 주자 → 홈
    if (runners.first) {
      const runner      = runners.first
      const runner_dist = calcRunnerDist(runner, 1, 'home', stealState)
      const verdict     = throwVerdict(runner, runner_dist, 'home')
      if (verdict === 'safe') {
        runsScored++
        moves.push({ runner, from: 1, to: 'home' })
      } else {
        outs_added++
      }
      nextRunners.first = null
    }
  }

  return { nextRunners, runsScored, outs_added, moves }
}

// ============================================================
// resolveBatterAdvance — 타자 추가 진루 독립 판정 (가상 2루 송구)
//
// 수비수의 실제 송구 방향과 무관하게:
//   "수비수가 2루로 던졌다면 타자가 이길 수 있는가?"로 판정.
// 내야 안타는 1루 직선 주루만 (추가 진루 없음).
// ============================================================

function resolveBatterAdvance(
  batter: Player,
  hp:     HitResultDetail,
): 1 | 2 {
  if (hp.is_infield) return 1  // 내야 안타: 1루 고정

  const fielder_pos  = getFielderPos(hp)
  const throw_dist   = euclidDist(fielder_pos, BASE_POS['2B'])
  const runner_dist  = calcRemainingTo2B(hp.t_ball_travel, batter)
  const verdict      = resolveThrow(hp.fielder, throw_dist, hp.t_fielding, batter, runner_dist)
  return verdict === 'safe' ? 2 : 1
}

// ============================================================
// advanceRunners — 안타 종류별 주자 이동
//
// hitPhysics 없으면 기존 고정 룰 fallback (backward compat 유지)
// ============================================================

export function advanceRunners(
  result:         AtBatResult,
  runners:        Runners,
  batter:         Player,
  hitPhysics?:    HitResultDetail,
  stealState?:    StealState,
  defenceLineup?: Player[],
): AdvanceResult {
  if (result === 'walk' || result === 'hit_by_pitch') {
    return forceAdvance(runners, batter)
  }

  // hitPhysics 없으면 기존 고정 룰
  if (!hitPhysics || result === 'strikeout' || result === 'out' ||
      result === 'home_run' || result === 'triple') {
    return fixedAdvance(result, runners, batter)
  }

  const moves: RunnerMove[] = []
  let runsScored = 0
  let next: Runners = { first: null, second: null, third: null }

  // ── 3루 주자 → 홈 (단타/2루타 공통, 항상 득점) ──────────
  if (runners.third) {
    runsScored++
    moves.push({ runner: runners.third, from: 3, to: 'home' })
  }

  let outs_added = 0

  if (result === 'single') {
    // leading runner 판정 (2루 or 1루 주자)
    const leadResult = resolveLeadingRunner(
      runners, 'single', hitPhysics, stealState, defenceLineup,
    )
    runsScored  += leadResult.runsScored
    outs_added  += leadResult.outs_added
    moves.push(...leadResult.moves)
    next = { ...next, ...leadResult.nextRunners }

    // [공짜 진루] 2루 주자가 leading runner였고 1루 주자도 있었으면
    // → 1루 주자는 2루 FREE (수비수가 홈으로 던지는 사이 공이 오지 않음)
    if (runners.second !== null && runners.first !== null) {
      const freeRunner = runners.first
      next.second = freeRunner
      next.first  = null
      moves.push({ runner: freeRunner, from: 1, to: 2 })
    }

    // 타자 추가 진루 판정 (독립 평가)
    // 2루가 이미 점유됐으면 1루로 fallback (선행 주자 우선)
    const batterBase = resolveBatterAdvance(batter, hitPhysics)
    if (batterBase === 2 && next.second === null) {
      next.second = batter
      moves.push({ runner: batter, from: 'batter', to: 2 })
    } else {
      next.first = batter
      moves.push({ runner: batter, from: 'batter', to: 1 })
    }

  } else if (result === 'double') {
    // 2루 주자 → 홈 (고정)
    if (runners.second) {
      runsScored++
      moves.push({ runner: runners.second, from: 2, to: 'home' })
    }
    // 1루 주자 판정
    const leadResult = resolveLeadingRunner(
      { ...runners, second: null }, 'double', hitPhysics, stealState, defenceLineup,
    )
    runsScored  += leadResult.runsScored
    outs_added  += leadResult.outs_added
    moves.push(...leadResult.moves)
    next = { ...next, ...leadResult.nextRunners }

    // 타자 2루 고정
    next.second = batter
    moves.push({ runner: batter, from: 'batter', to: 2 })
  }

  return { nextRunners: next, runsScored, outs_added, moves }
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

  return { nextRunners: next, runsScored, outs_added: 0, moves }
}

// ============================================================
// forceAdvance — 볼넷/사구 강제 진루
// ============================================================

export function forceAdvance(runners: Runners, batter: Player): AdvanceResult {
  const moves: RunnerMove[] = []
  let runsScored = 0

  let third  = runners.third
  let second = runners.second
  let first  = runners.first

  if (first && second && third) {
    runsScored++
    moves.push({ runner: third, from: 3, to: 'home' })
    third  = second
    moves.push({ runner: second, from: 2, to: 3 })
    second = first
    moves.push({ runner: first, from: 1, to: 2 })
  } else if (first && second) {
    third  = second
    moves.push({ runner: second, from: 2, to: 3 })
    second = first
    moves.push({ runner: first, from: 1, to: 2 })
  } else if (first) {
    second = first
    moves.push({ runner: first, from: 1, to: 2 })
  }

  moves.push({ runner: batter, from: 'batter', to: 1 })

  return {
    nextRunners: { first: batter, second, third },
    runsScored,
    outs_added: 0,
    moves,
  }
}
