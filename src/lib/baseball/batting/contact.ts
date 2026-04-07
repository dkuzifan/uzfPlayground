import type { ZoneType, FamiliarityMap, PitchResult } from '../engine/types'
import type { BattingState } from './types'
import type { PredictionResult } from './predict-pitch'
import type { PerceptionResult } from './read-pitch'
import { CONTACT_CONFIG } from './config'

// ============================================================
// v2: 컨택 판정 — timing_offset + center_offset 출력
//
// timing_offset: 예측 구종과 실제 구종의 속도 차이에서 발생
//   → 양수: 스윙이 빠름 (당기기), 음수: 느림 (밀어치기)
// center_offset: 인지 코스와 실제 코스의 차이에서 발생
//   → 양수: 배트 아래쪽 적중 (플라이), 음수: 위쪽 적중 (땅볼)
// ============================================================

export interface ContactResult {
  contact:        boolean
  timing_offset?: number   // 타이밍 오차 (contact=true일 때만)
  center_offset?: number   // 중심 적중 오차 (contact=true일 때만)
}

// 구종별 대략적 속도 지표 (상대값, 패스트볼 = 1.0)
const PITCH_SPEED_INDEX: Record<string, number> = {
  fastball:  1.00,
  sinker:    0.95,
  cutter:    0.93,
  slider:    0.82,
  curveball: 0.72,
  changeup:  0.80,
  splitter:  0.83,
  forkball:  0.78,
}

function gaussianRandom(mean: number, std: number): number {
  const u1 = Math.random()
  const u2 = Math.random()
  return mean + std * Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2)
}

/**
 * v2 컨택 판정.
 * prediction/perception이 없으면 기존 v1 로직 (contact만 반환).
 */
export function resolveContact(
  zoneType:    ZoneType,
  pitchResult: PitchResult,
  pitcher:     BattingState['pitcher'],
  batter:      BattingState['batter'],
  familiarity: FamiliarityMap,
  count:       BattingState['count'],
  prediction?: PredictionResult,
  perception?: PerceptionResult,
): ContactResult {
  const { base_contact, pitch_modifier_max, familiarity_bonus_max, two_strike_contact_bonus } = CONTACT_CONFIG

  // ── 기본 컨택 확률 (v1과 동일) ─────────────────────────
  const { intercept, slope } = base_contact[zoneType]
  const base = intercept + (batter.stats.contact / 100) * slope

  const pitchData = pitcher.pitch_types.find(pt => pt.type === pitchResult.pitch_type)
  const pitch_modifier = pitchData
    ? 1.0 - (pitchData.ball_power + pitchData.ball_speed + pitchData.ball_break) / 300 * pitch_modifier_max
    : 1.0

  const fam_val =
    familiarity[pitchResult.pitch_type]?.[String(pitchResult.actual_zone)] ?? 0
  const familiarity_bonus = 1.0 + fam_val * familiarity_bonus_max

  const strike_bonus = count.strikes >= 2 ? two_strike_contact_bonus : 0

  const contact_prob = Math.min(Math.max(base * pitch_modifier * familiarity_bonus + strike_bonus, 0), 1)
  const contact = Math.random() < contact_prob

  if (!contact) return { contact: false }

  // ── v2: timing_offset + center_offset 계산 ─────────────

  if (!prediction || !perception) {
    // fallback: 오프셋 없이 반환 (hit-ball.ts에서 기존 경로로 처리)
    return { contact: true }
  }

  // timing_offset: 예측한 구종의 속도 vs 실제 구종의 속도
  // 패스트볼을 예상했는데 체인지업이 오면 → 스윙이 빠름 (timing > 0)
  const predicted_speed = PITCH_SPEED_INDEX[prediction.predicted_type] ?? 0.85
  const actual_speed    = PITCH_SPEED_INDEX[pitchResult.pitch_type] ?? 0.85
  const speed_diff      = predicted_speed - actual_speed  // 양수: 예측이 더 빠른 공

  // Contact 스탯으로 조정 능력 반영: 높을수록 속도 차이를 극복
  const adjustment_factor = 0.5 + (batter.stats.contact / 100) * 0.5  // 0.5~1.0
  const raw_timing = speed_diff / adjustment_factor

  // 기본 타이밍 노이즈 (완벽한 예측이라도 약간의 오차)
  const timing_noise = gaussianRandom(0, 0.08 * (1 - batter.stats.contact / 200))
  const timing_offset = raw_timing + timing_noise

  // center_offset: 인지 코스 vs 실제 코스의 차이
  // actual_x, actual_z가 있으므로 실제 위치와 인지 위치의 차이를 모델링
  // 인지가 정확하면 (zone_correct) 오차가 작고, 틀리면 오차가 큼
  const zone_error = perception.zone_correct ? 0.0 : 0.15  // 존 오인식 시 추가 오차
  const center_noise_std = 0.10 * (1 - batter.stats.contact / 150) + zone_error
  const center_offset = gaussianRandom(0, center_noise_std)

  return { contact: true, timing_offset, center_offset }
}
