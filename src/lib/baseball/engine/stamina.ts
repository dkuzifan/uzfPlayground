import type { PitchType, Player } from '../types/player'
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

// 자동 교체 판단 — 감독 모드에서는 이 함수 대신 유저 입력 사용
export function shouldAutoRelieve(stamina: number, bullpen: Player[]): boolean {
  return checkRelief(stamina) && bullpen.length > 0
}
