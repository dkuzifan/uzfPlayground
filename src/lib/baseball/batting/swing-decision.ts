import type { ZoneType } from '../engine/types'
import type { BattingState } from './types'
import type { PredictionResult } from './predict-pitch'
import type { PerceptionResult } from './read-pitch'
import { SWING_CONFIG } from './config'
import { calcCoordinateDistance } from './zone-proximity'

// ============================================================
// v2: 스윙 결정
//
// 인지된 존 기반 (스트라이크/볼 판단) + 좌표 근접도 (준비도)
// + 구종 속도 유사성 + 카운트 압박 + 스탯
// ============================================================

// 존별 기본 스윙 경향 (인지된 존 기준)
const ZONE_SWING: Record<ZoneType, number> = {
  core: 0.72, edge: 0.55, chase: 0.22, ball: 0.06, dirt: 0.04,
}

function calcSpeedSimilarity(predictedType: string, actualType: string): number {
  const tiers = SWING_CONFIG.pitch_speed_tier
  const key = `${tiers[predictedType] ?? 'fast'}-${tiers[actualType] ?? 'fast'}`
  return SWING_CONFIG.speed_tier_similarity[key] ?? 0.5
}

/**
 * 좌표 거리(m) → 근접도 수정자 (0.7 ~ 1.3).
 * 거리 0m: 예측 적중 → ×1.3 (자신감)
 * 거리 0.3m+: 먼 곳 → ×0.7 (준비 안 됨)
 */
function proximityModifier(dist_m: number): number {
  // 0m → 1.3, 0.15m → 1.0, 0.30m+ → 0.7
  return Math.max(0.7, 1.3 - dist_m * 2.0)
}

export function decideSwing(
  batter:      BattingState['batter'],
  zoneType:    ZoneType,
  count:       BattingState['count'],
  prediction?: PredictionResult,
  perception?: PerceptionResult,
  actual_x?:   number,
  actual_z?:   number,
): boolean {
  const contact = batter.stats.contact
  const eye = batter.stats.eye ?? SWING_CONFIG.eye_default

  // ── fallback: 예측/인식 없으면 v1 로직 ──────────────
  if (!prediction || !perception) {
    const eye_modifier = (eye - 50) / 200
    const count_key = `${count.balls}-${count.strikes}`
    const count_mod = SWING_CONFIG.count_modifier[count_key] ?? 0
    const p = Math.min(Math.max(ZONE_SWING[zoneType] + count_mod + eye_modifier, 0), 1)
    return Math.random() < p
  }

  // ── v2 ─────────────────────────────────────────────

  // 1. 인지된 존에 따른 기본 스윙 경향
  let p_swing = ZONE_SWING[perception.perceived_zone]

  // 2. 좌표 근접도: 예측 위치 vs 실제 공 위치 (타자 눈에 보이는 물리적 위치)
  if (actual_x !== undefined && actual_z !== undefined) {
    const dist = calcCoordinateDistance(
      prediction.predicted_zone_id,
      actual_x, actual_z,
      batter.zone_bottom, batter.zone_top,
    )
    p_swing *= proximityModifier(dist)
  }

  // 3. 구종 속도 유사성: 타이밍 준비도
  const speed_sim = calcSpeedSimilarity(prediction.predicted_type, perception.perceived_type)
  p_swing *= 0.85 + speed_sim * 0.3  // 0.85~1.15

  // 4. 카운트 보정
  const count_key = `${count.balls}-${count.strikes}`
  const count_adj = (SWING_CONFIG.count_pressure[count_key] ?? 0.35) - 0.35
  p_swing += count_adj

  // 5. 스탯 보정
  p_swing += (contact / 100) * SWING_CONFIG.contact_swing_scale * 0.5
  if (['ball', 'dirt'].includes(perception.perceived_zone)) {
    p_swing -= (eye / 100) * SWING_CONFIG.eye_take_scale
  }

  // 6. 2스트라이크 보호
  if (count.strikes >= 2) {
    p_swing = Math.max(p_swing, 0.30)
  }

  return Math.random() < Math.min(Math.max(p_swing, 0.02), 0.95)
}
