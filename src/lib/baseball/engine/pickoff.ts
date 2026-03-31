import type { Player } from '../types/player'
import type { Runners } from '../game/types'

// ============================================================
// 견제(Pickoff) 판정
// ============================================================

export interface PickoffDecision {
  attempt: boolean
  base:    1 | 2 | null
  runner:  Player | null
}

/**
 * 투구 전 견제 시도 여부 및 대상 결정.
 *
 * 견제 가능 상황:
 *   1루만    → 1루 견제
 *   2루만    → 2루 견제
 *   1+2루    → 2루 견제 (선행 주자)
 *   1+3루    → 1루 견제 (3루 주자 견제는 비효율)
 *   3루/2+3루/만루 → 견제 없음
 *
 * 견제 확률(%) = 2 + sqrt(runner.running) × (0.18^3)
 */
export function decidePickoff(
  pitcher: Player,
  runners: Runners,
): PickoffDecision {
  const { first, second, third } = runners

  let base:   1 | 2 | null = null
  let runner: Player | null = null

  if (first && !second && !third) {
    base = 1; runner = first
  } else if (!first && second && !third) {
    base = 2; runner = second
  } else if (first && second && !third) {
    base = 2; runner = second  // 선행 주자
  } else if (first && !second && third) {
    base = 1; runner = first
  }
  // 3루만, 2+3루, 만루 → 견제 없음

  if (!base || !runner) return { attempt: false, base: null, runner: null }

  // 투수 스탯은 견제 확률 공식에 포함되지 않지만 pitcher를 통해 향후 확장 가능
  void pitcher

  const prob = 2 + Math.sqrt(runner.stats.running) * (0.18 ** 3)
  const attempt = Math.random() * 100 < prob

  return { attempt, base: attempt ? base : null, runner: attempt ? runner : null }
}

/**
 * 견제 결과 판정.
 *
 * OUT 확률 = max(0, (pitcher.ball_control × 1e-7)^0.52 − (runner.running × 0.00013)^2)
 */
export function resolvePickoff(
  pitcher: Player,
  runner:  Player,
): 'out' | 'safe' {
  const pitcherFactor = (pitcher.stats.ball_control * 1e-7) ** 0.52
  const runnerFactor  = (runner.stats.running * 0.00013) ** 2
  const outProb       = Math.max(0, pitcherFactor - runnerFactor)

  return Math.random() < outProb ? 'out' : 'safe'
}
