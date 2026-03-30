import type { PitchType } from '../types/player'
import { STAMINA_CONFIG } from './config'

// ============================================================
// M7: 스태미나 소모 + 강판 체크
// ============================================================

export function consumeStamina(
  currentStamina: number,
  pitchType: PitchType
): number {
  const cost =
    STAMINA_CONFIG.fatigue_per_pitch *
    STAMINA_CONFIG.pitch_type_modifier[pitchType]
  return Math.max(currentStamina - cost, 0)
}

export function checkRelief(stamina: number): boolean {
  return stamina <= STAMINA_CONFIG.relief_threshold
}
