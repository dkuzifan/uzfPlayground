import type { ZoneType, FamiliarityMap, PitchResult } from '../engine/types'
import type { BattingState } from './types'
import type { PredictionResult } from './predict-pitch'
import type { PerceptionResult } from './read-pitch'
import { CONTACT_CONFIG } from './config'
import { calcCoordinateDistance } from './zone-proximity'

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
  twoseam:   0.98,
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
  // Step 9 — 3-0 구위 감소 시 effective_ball_power 우선 적용
  const effBallPower = pitchResult.effective_ball_power ?? pitchData?.ball_power ?? 0
  const pitch_modifier = pitchData
    ? 1.0 - (effBallPower + pitchData.ball_speed + pitchData.ball_break) / 300 * pitch_modifier_max
    : 1.0

  const fam_val =
    familiarity[pitchResult.pitch_type]?.[String(pitchResult.actual_zone)] ?? 0
  const familiarity_bonus = 1.0 + fam_val * familiarity_bonus_max

  // 2스트라이크 보호 보너스: Contact 스탯 연동
  // Contact 40 이하 → 0%, 80 → ~5%, 120+ → 10% (cap)
  // 높은 컨택 타자일수록 끈질기게 파울/컨택을 만들어냄
  const strike_bonus = count.strikes >= 2
    ? Math.min(0.10, Math.max(0, (batter.stats.contact - 40) / 80) * 0.10)
    : 0

  const contact_prob = Math.min(Math.max(base * pitch_modifier * familiarity_bonus + strike_bonus, 0), 1)
  const contact = Math.random() < contact_prob

  if (!contact) return { contact: false }

  // ── v2: timing_offset + center_offset 계산 ─────────────

  if (!prediction || !perception) {
    // fallback: 오프셋 없이 반환 (hit-ball.ts에서 기존 경로로 처리)
    return { contact: true }
  }

  const v2 = CONTACT_CONFIG.v2 ?? { timing_noise_std_base: 0.08, center_noise_std_base: 0.10, zone_error_penalty: 0.15 }

  // ── 좌표 거리 페널티 ──────────────────────────────────
  // 예측 위치와 실제 투구 위치의 물리적 거리 → 조정 필요량
  const coord_dist = calcCoordinateDistance(
    prediction.predicted_zone_id,
    pitchResult.actual_x, pitchResult.actual_z,
    batter.zone_bottom, batter.zone_top,
  )
  // Contact로 거리 페널티 감소 (최대 40% 감소, 물리적 한계)
  const contact_reduction = Math.max(0.60, 1.0 - (batter.stats.contact / 100) * 0.40)
  const effective_dist = coord_dist * contact_reduction

  // 제곱 비례 페널티: 작은 거리는 거의 무시, 큰 거리는 급격히 증가
  // 0.05m → 0.003, 0.15m → 0.023, 0.25m → 0.063, 0.50m → 0.250
  const dist_sq = effective_dist * effective_dist

  // ── timing_offset: 구종 속도 차이 + 존 거리 페널티 ─────
  const predicted_speed = PITCH_SPEED_INDEX[prediction.predicted_type] ?? 0.85
  const actual_speed    = PITCH_SPEED_INDEX[pitchResult.pitch_type] ?? 0.85
  const speed_diff      = predicted_speed - actual_speed

  const adjustment_factor = 0.5 + (batter.stats.contact / 100) * 0.5
  const raw_timing = speed_diff / adjustment_factor

  // 존 거리(제곱) → 재계산 시간 추가 (감쇠 합산)
  const zone_timing_penalty = dist_sq * 0.4
  const timing_noise = gaussianRandom(0, v2.timing_noise_std_base * (1 - batter.stats.contact / 200))
  const timing_offset = raw_timing + zone_timing_penalty * 0.6 + timing_noise

  // ── center_offset: 존 거리(제곱) + 인식 오차 ──────────
  const zone_center_penalty = dist_sq * 0.6
  const zone_error = perception.zone_correct ? 0.0 : v2.zone_error_penalty
  const center_noise_std = v2.center_noise_std_base * (1 - batter.stats.contact / 150) + zone_error
  const center_offset = zone_center_penalty + gaussianRandom(0, center_noise_std)

  return { contact: true, timing_offset, center_offset }
}
