import type { BattingState, BattingResult, AtBatResult } from './types'

type CountEvent = 'strike' | 'ball' | 'foul'

// ============================================================
// M8/M9: 볼카운트 업데이트 + 삼진/볼넷/사구 처리
// ============================================================

export function applyPitchToCount(
  current: BattingState['count'],
  event: CountEvent,
  is_hbp: boolean
): Pick<BattingResult, 'next_count' | 'at_bat_over' | 'at_bat_result'> {
  // 사구: 볼카운트와 무관하게 즉시 종료
  if (is_hbp) {
    return {
      next_count: current,
      at_bat_over: true,
      at_bat_result: 'hit_by_pitch',
    }
  }

  const { balls, strikes } = current

  if (event === 'ball') {
    const next_balls = balls + 1
    if (next_balls >= 4) {
      return {
        next_count: { balls: next_balls, strikes },
        at_bat_over: true,
        at_bat_result: 'walk',
      }
    }
    return {
      next_count: { balls: next_balls, strikes },
      at_bat_over: false,
      at_bat_result: 'in_progress',
    }
  }

  if (event === 'strike') {
    const next_strikes = strikes + 1
    if (next_strikes >= 3) {
      return {
        next_count: { balls, strikes: next_strikes },
        at_bat_over: true,
        at_bat_result: 'strikeout',
      }
    }
    return {
      next_count: { balls, strikes: next_strikes },
      at_bat_over: false,
      at_bat_result: 'in_progress',
    }
  }

  // foul: 2스트라이크 이후엔 카운트 유지
  if (event === 'foul') {
    const next_strikes = strikes < 2 ? strikes + 1 : strikes
    return {
      next_count: { balls, strikes: next_strikes },
      at_bat_over: false,
      at_bat_result: 'in_progress',
    }
  }

  // exhaustive check
  const _: never = event
  return _
}
