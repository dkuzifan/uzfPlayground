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
  const baseRate = base === 1 ? 0.15 : 0.05
  const rate     = (baseRate + (diff ** 0.4) * 0.01) * (0.9 ** pickoutCount)

  return Math.random() < Math.min(1, Math.max(0, rate))
}

/**
 * 도루 성공 여부 판정.
 *
 * adjustedRunning = runner.running - (pickoutCount × 10)
 * avg3 = avg(pitch.delivery_time의 역수 기반 구속, catcher.defence, catcher.throw)
 *   - delivery_time이 작을수록 빠른 공(도루 불리) → speed = 1/delivery_time × 스케일
 *   - 스케일: delivery_time ≈ 0.4~0.6s → 1/0.5 = 2.0, ×40 → 80 (스탯 범주 일치)
 * base = 0.5 + (adjustedRunning - avg3) × 0.01
 * 보정: 헛스윙 → ×0.95, 3루/홈 도루 → ×1.10
 */
export function resolveStealResult(
  runner:         Player,
  to:             2 | 3 | 'home',
  pitch:          PitchResult,
  catcher:        Player,
  isSwingAndMiss: boolean,
  pickoutCount:   number,
): 'success' | 'caught' {
  const adjustedRunning = runner.stats.running - pickoutCount * 10
  const pitchSpeed      = (1 / pitch.delivery_time) * 40  // delivery_time → 구속 스케일 변환
  const avg3            = (pitchSpeed + catcher.stats.defence + catcher.stats.throw) / 3

  let prob = 0.5 + (adjustedRunning - avg3) * 0.01

  if (isSwingAndMiss)          prob *= 0.95
  if (to === 3 || to === 'home') prob *= 1.10

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
    const homeDashProb = Math.min(1, Math.max(0,
      0.5 + (third.stats.running - avg3) * 0.01 * 1.10  // 홈 도루 보정
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
