import type { ZoneType, FamiliarityMap, PitchResult } from '../engine/types'
import type { BattingState } from './types'
import { CONTACT_CONFIG } from './config'

// ============================================================
// M4: 컨택 판정 (헛스윙 / 파울 / 페어)
// ============================================================

export function resolveContact(
  zoneType: ZoneType,
  pitchResult: PitchResult,
  pitcher: BattingState['pitcher'],
  batter: BattingState['batter'],
  familiarity: FamiliarityMap,
  count: BattingState['count']
): { contact: boolean; is_fair: boolean | null } {
  const { base_contact, pitch_modifier_max, familiarity_bonus_max, fair_prob, two_strike_contact_bonus } = CONTACT_CONFIG

  // 기본 컨택 확률: intercept + (Contact/100) × slope
  const { intercept, slope } = base_contact[zoneType]
  const base = intercept + (batter.stats.contact / 100) * slope

  // 구종 난이도 페널티: 1.0 - (구위 + 구속 + 변화) / 300 × pitch_modifier_max
  const pitchData = pitcher.pitch_types.find(pt => pt.type === pitchResult.pitch_type)
  const pitch_modifier = pitchData
    ? 1.0 - (pitchData.ball_power + pitchData.ball_speed + pitchData.ball_break) / 300 * pitch_modifier_max
    : 1.0

  // 익숙함 보너스: 1.0 + familiarity × familiarity_bonus_max
  const fam_val =
    familiarity[pitchResult.pitch_type]?.[String(pitchResult.actual_zone)] ?? 0
  const familiarity_bonus = 1.0 + fam_val * familiarity_bonus_max

  // 2-스트라이크 컨택 보너스: 타자가 배트 짧게 잡고 플레이트 보호
  const strike_bonus = count.strikes >= 2 ? two_strike_contact_bonus : 0

  const contact_prob = Math.min(Math.max(base * pitch_modifier * familiarity_bonus + strike_bonus, 0), 1)
  const contact = Math.random() < contact_prob

  if (!contact) return { contact: false, is_fair: null }

  const is_fair = Math.random() < fair_prob[zoneType]
  return { contact: true, is_fair }
}
