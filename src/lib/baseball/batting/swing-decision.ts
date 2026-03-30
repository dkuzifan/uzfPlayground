import type { ZoneType } from '../engine/types'
import type { BattingState } from './types'
import { SWING_CONFIG } from './config'

// ============================================================
// M3: 스윙 여부 판정
// ============================================================

export function decideSwing(
  batter: BattingState['batter'],
  zoneType: ZoneType,
  count: BattingState['count']
): boolean {
  const { base_swing, count_modifier, eye_default } = SWING_CONFIG

  // Eye 스탯 미구현 → 50 고정, modifier = 0
  const eye = eye_default
  const eye_modifier = (eye - 50) / 200

  const count_key = `${count.balls}-${count.strikes}`
  const count_mod = count_modifier[count_key] ?? 0

  const p_swing = Math.min(
    Math.max(base_swing[zoneType] + count_mod + eye_modifier, 0),
    1
  )

  void batter  // Eye 스탯 활성화 시 batter.stats.eye 사용 예정

  return Math.random() < p_swing
}
