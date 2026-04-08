import type { ZoneType } from '../engine/types'
import type { BattingState } from './types'
import type { PredictionResult } from './predict-pitch'
import type { PerceptionResult } from './read-pitch'
import { SWING_CONFIG } from './config'
import { calcCoordinateDistance } from './zone-proximity'

// ============================================================
// v2: 스윙 결정
//
// blend 공식: p_swing = 존의지 × (1-확신도) × (1-선택성)
//                     + 예측의지[존] × 확신도
//
// 존의지: "스트라이크인가 볼인가" 판단 → 스윙 기저값
// 예측의지: "노린 공이면 친다" → 존에 따라 차등 (볼이면 리스크)
// 확신도: 예측 좌표 vs 실제 좌표 근접도 (0~1)
// 선택성: 카운트에 따른 까다로움 (높을수록 내 공만 기다림)
// ============================================================

// 존별 기본 스윙 경향 (인지된 존 기준 — "이게 스트라이크인가?")
const ZONE_SWING: Record<ZoneType, number> = {
  core: 0.72, edge: 0.55, chase: 0.22, ball: 0.06, dirt: 0.04,
}

// 예측 적중 시 스윙 의지 (존에 따라 차등 — 볼은 리스크 때문에 낮음)
const PREDICTION_DESIRE: Record<ZoneType, number> = {
  core: 0.75, edge: 0.75, chase: 0.55, ball: 0.35, dirt: 0.25,
}

// 카운트별 선택성: 높을수록 "내 공만 기다린다" (존의지 억제)
const COUNT_SELECTIVITY: Record<string, number> = {
  '3-0': 0.65,  // 볼넷 눈앞 → 매우 선택적
  '2-0': 0.45,  // 여유 → 선택적
  '3-1': 0.45,
  '1-0': 0.28,
  '0-0': 0.22,  // 중립 — 적당히 적극적
  '1-1': 0.18,
  '2-1': 0.18,
  '0-1': 0.15,  // 약간 불리 → 적극적
  '2-2': 0.08,  // 보호 모드
  '3-2': 0.12,  // 풀카운트
  '0-2': 0.05,  // 삼진 위기 → 거의 보호
  '1-2': 0.05,
}

function calcSpeedSimilarity(predictedType: string, actualType: string): number {
  const tiers = SWING_CONFIG.pitch_speed_tier
  const key = `${tiers[predictedType] ?? 'fast'}-${tiers[actualType] ?? 'fast'}`
  return SWING_CONFIG.speed_tier_similarity[key] ?? 0.5
}

/**
 * 좌표 거리(m) → 확신도(proximity, 0~1).
 * 0m = 1.0 (정확히 예측), 0.40m+ = ~0.05 (전혀 다른 곳)
 */
function distToProximity(dist_m: number): number {
  return Math.max(0.05, 1.0 - dist_m * 2.5)
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

  // ── v2: blend 공식 ────────────────────────────────────

  // 1. 확신도 (proximity): 예측 좌표 vs 실제 좌표 거리
  let proximity = 0.5  // 기본값
  if (actual_x !== undefined && actual_z !== undefined) {
    const dist = calcCoordinateDistance(
      prediction.predicted_zone_id,
      actual_x, actual_z,
      batter.zone_bottom, batter.zone_top,
    )
    proximity = distToProximity(dist)
  }

  // 2. 구종 속도 유사성 → 확신도 보정
  const speed_sim = calcSpeedSimilarity(prediction.predicted_type, perception.perceived_type)
  proximity *= (0.7 + speed_sim * 0.3)  // 구종 다르면 확신도 하락

  // 3. 선택성 (카운트 기반)
  const count_key = `${count.balls}-${count.strikes}`
  const selectivity = COUNT_SELECTIVITY[count_key] ?? 0.45

  // 4. blend
  // proximity는 존의지를 절반만 억제 (proximity 0.5일 때 존의지 75% 유지)
  // selectivity는 존의지를 직접 억제 (선택적일수록 존의지 의존 ↓)
  const perceived_zone = perception.perceived_zone
  const zone_desire = ZONE_SWING[perceived_zone]
  const pred_desire = PREDICTION_DESIRE[perceived_zone]

  const prox_suppress = 1 - proximity * 0.5  // 0.5~1.0 (proximity가 존의지 절반만 억제)
  let p_swing = zone_desire * prox_suppress * (1 - selectivity)
              + pred_desire * proximity

  // 5. 스탯 보정
  // Contact: 적응력 → 약간의 스윙 범위 확대
  p_swing += (contact / 100) * SWING_CONFIG.contact_swing_scale * 0.3

  // Eye: 볼 영역에서 스윙 억제 강화
  if (['ball', 'dirt'].includes(perceived_zone)) {
    p_swing -= (eye / 100) * SWING_CONFIG.eye_take_scale
  }

  // 6. 2스트라이크 보호 floor
  if (count.strikes >= 2) {
    p_swing = Math.max(p_swing, 0.25)
  }

  return Math.random() < Math.min(Math.max(p_swing, 0.02), 0.95)
}
