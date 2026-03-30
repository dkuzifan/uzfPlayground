import type { PitchType } from '../types/player'
import type { GamePitchState } from './types'
import { PITCH_SELECT_CONFIG } from './config'

// ============================================================
// Weighted random selection utility
// ============================================================

function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

// ============================================================
// M2: 구종 선택
// ============================================================

export function selectPitchType(
  pitcher: GamePitchState['pitcher'],
  recentPitches: GamePitchState['recent_pitches'],
  situation: Pick<GamePitchState, 'count' | 'is_scoring_position'>
): PitchType {
  const { k, N, boost } = PITCH_SELECT_CONFIG

  if (pitcher.pitch_types.length === 0) {
    // 비투수 fallback (방어적 처리)
    return 'fastball'
  }

  const window = recentPitches.slice(-N)

  // 각 구종 카운트 (최근 N구 내)
  const recentCount: Partial<Record<PitchType, number>> = {}
  for (const p of window) {
    recentCount[p.type] = (recentCount[p.type] ?? 0) + 1
  }

  const totalBaseWeight = pitcher.pitch_types.reduce(
    (sum, pt) => sum + pt.ball_power + pt.ball_break + pt.ball_speed,
    0
  )

  // 위기 상황: 볼카운트 3 or 득점권
  const isCrisis = situation.count.balls === 3 || situation.is_scoring_position

  // 위기 시 가장 강한 구종 (ball_power + ball_break + ball_speed 최고)
  let bestPitchType: PitchType | null = null
  if (isCrisis) {
    let bestScore = -Infinity
    for (const pt of pitcher.pitch_types) {
      const score = pt.ball_power + pt.ball_break + pt.ball_speed
      if (score > bestScore) {
        bestScore = score
        bestPitchType = pt.type
      }
    }
  }

  const weights = pitcher.pitch_types.map(pt => {
    const baseWeight = (pt.ball_power + pt.ball_break + pt.ball_speed) / totalBaseWeight
    const penalty = 1 / (1 + k * (recentCount[pt.type] ?? 0))
    const crisisBoost = isCrisis && pt.type === bestPitchType ? boost : 1.0
    return baseWeight * penalty * crisisBoost
  })

  const pitchTypeList = pitcher.pitch_types.map(pt => pt.type)
  return weightedRandom(pitchTypeList, weights)
}
