import type { Player } from '../types/player'
import type { AtBatResult } from '../batting/types'
import type { Runners } from './types'

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
  moves:       RunnerMove[]
}

// ============================================================
// advanceRunners — 안타 종류별 고정 룰 (MVP)
// ============================================================

export function advanceRunners(
  result:  AtBatResult,
  runners: Runners,
  batter:  Player,
): AdvanceResult {
  if (result === 'walk' || result === 'hit_by_pitch') {
    return forceAdvance(runners, batter)
  }

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
      // strikeout / out — 주자 이동 없음
      break
  }

  return { nextRunners: next, runsScored, moves }
}

// ============================================================
// forceAdvance — 볼넷/사구 강제 진루
// 1루→2루→3루→홈 순으로 연쇄 (만루 시 3루 주자 득점)
// ============================================================

export function forceAdvance(runners: Runners, batter: Player): AdvanceResult {
  const moves: RunnerMove[] = []
  let runsScored = 0

  let third  = runners.third
  let second = runners.second
  let first  = runners.first

  // 연쇄 진루: 1루가 채워져 있어야 뒤 주자가 밀림
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
    moves,
  }
}
