import type { Player } from '../types/player'
import type { PitchResult } from '../engine/types'
import type { Runners } from './types'

// ============================================================
// 도루(Stolen Base) 판정
// ============================================================

/**
 * 도루 시도 여부 결정.
 *
 * 조건: runner.running >= avg(pitcher.ball_speed, catcher.throw)
 * 시도율 base: base===1 → 0.15, base===2 → 0.05
 * 시도율 = (base + (running - avg)^0.4 × 0.01) × 0.9^pickoutCount
 * clamp(0, 1)
 *
 * @param base 현재 루 (1: 1루→2루 도루, 2: 2루→3루 도루)
 * @param pickoutCount 이 타석에서 견제 실패 횟수 (패널티)
 */
export function decideStealAttempt(
  runner:       Player,
  base:         1 | 2,
  pitcher:      Player,
  catcher:      Player,
  pickoutCount: number,
): boolean {
  const running = runner.stats.running
  const avg     = (pitcher.stats.ball_speed + catcher.stats.throw) / 2

  if (running < avg) return false

  const diff     = running - avg
  // per-pitch 기준: 0.06/0.02 → PA당 누적 시도율 ~30-40% (MLB 0.5~1.5 시도/경기 충족)
  const baseRate = base === 1 ? 0.06 : 0.02
  const rate     = (baseRate + (diff ** 0.4) * 0.01) * (0.9 ** pickoutCount)

  return Math.random() < Math.min(1, Math.max(0, rate))
}

/**
 * 도루 성공 여부 판정.
 *
 * adjustedRunning = runner.running - (pickoutCount × 5)
 * avg = (pitcher.ball_speed + catcher.throw) / 2  (decideStealAttempt과 동일 기준)
 * base = 0.74 + (adjustedRunning - avg) × 0.006
 * 보정: 헛스윙 → ×0.95, 3루/홈 도루 → ×1.05
 *
 * 설계 의도: MLB 도루 성공률 74~85% 충족.
 * avg 기준을 decideStealAttempt와 통일해 pitchSpeed 변동에 의한 과소 편향 제거.
 */
export function resolveStealResult(
  runner:         Player,
  to:             2 | 3 | 'home',
  pitch:          PitchResult,
  catcher:        Player,
  isSwingAndMiss: boolean,
  pickoutCount:   number,
): 'success' | 'caught' {
  // pitcher는 직접 없으므로 delivery_time 역수로 pitch 구속 근사
  // — 단, avg 기준을 0~100 스탯 범주에 고정해 편향 방지
  void pitch  // pitch 인자 유지 (API 호환), 이후 확장용
  const adjustedRunning = runner.stats.running - pickoutCount * 5
  const avg = (catcher.stats.throw + catcher.stats.defence) / 2

  // base 0.74: MLB 평균 도루 성공률(74~85%) 기준, 빠른 주자(running=85)는 ~80%
  let prob = 0.74 + (adjustedRunning - avg) * 0.006

  if (isSwingAndMiss)             prob *= 0.95
  if (to === 3 || to === 'home')  prob *= 1.05

  return Math.random() < Math.min(1, Math.max(0, prob)) ? 'success' : 'caught'
}

/**
 * 도루 시도 시 포수 송구 결정 (더블 스틸 처리).
 *
 * 우선순위: 선행 주자(득점에 더 가까운 주자) 기준 송구.
 *
 * 1루만:  2루 송구 (targetRunner = runners.first)
 * 2루만:  3루 송구 (targetRunner = runners.second)
 * 1+2루:  3루 송구 (targetRunner = runners.second, 1루 주자는 2루 세이프)
 * 1+3루:
 *   P(3루 주자 홈 쇄도 성공) 계산
 *     > 0.50 → 포수 송구 안 함 (throwBase: null, 1루 주자 2루 세이프)
 *     ≤ 0.50 → 2루 송구 (throwBase: 2, targetRunner: runners.first)
 *              3루 주자는 별도 resolveStealResult 호출로 홈 쇄도 독립 판정
 */
export function decideCatcherThrow(
  runners:  Runners,
  catcher:  Player,
  pitcher:  Player,
  pitch:    PitchResult,
): { throwBase: 2 | 3 | 'home' | null; targetRunner: Player | null } {
  const { first, second, third } = runners

  // 2루만
  if (!first && second && !third) {
    return { throwBase: 3, targetRunner: second }
  }

  // 1루만
  if (first && !second && !third) {
    return { throwBase: 2, targetRunner: first }
  }

  // 1+2루: 3루 송구 (선행 주자 = 2루 주자)
  if (first && second && !third) {
    return { throwBase: 3, targetRunner: second }
  }

  // 1+3루: 3루 주자 홈 쇄도 성공률로 포수 송구 여부 결정
  if (first && !second && third) {
    // 홈 쇄도 성공 확률 추정 (단순 계산: resolveStealResult와 동일 공식)
    const pitchSpeed = (1 / pitch.delivery_time) * 40
    const avg3       = (pitchSpeed + catcher.stats.defence + catcher.stats.throw) / 3
    const catcherAvg = (catcher.stats.throw + catcher.stats.defence) / 2
    const homeDashProb = Math.min(1, Math.max(0,
      0.74 + (third.stats.running - catcherAvg) * 0.006 * 1.05  // 홈 도루 보정
    ))

    if (homeDashProb > 0.50) {
      // 포수 송구 포기 → 1루 주자 2루 세이프, 3루 주자는 홈 쇄도 독립 판정
      return { throwBase: null, targetRunner: null }
    } else {
      // 2루 송구 → 3루 주자는 별도 홈 쇄도 판정
      return { throwBase: 2, targetRunner: first }
    }
  }

  // 3루만, 2+3루, 만루 등 도루 가능 상황 외 (호출 안 되어야 하지만 방어 처리)
  void pitcher
  return { throwBase: null, targetRunner: null }
}
