import type { ZoneType, ZoneId } from '../engine/types'
import type { BattingState } from './types'
import type { PredictionResult } from './predict-pitch'
import type { PerceptionResult } from './read-pitch'
import { SWING_CONFIG } from './config'

// ============================================================
// v2: 스윙 결정 — 예측 근접도 × 속도 유사성 × 카운트 압박 × 스탯
//
// 핵심 질문: "이 공이 내가 노린 것과 얼마나 가까운가?"
// ============================================================

// 5×5 그리드에서 존 ID → (row, col) 매핑
const ZONE_GRID_POS: Record<string, [number, number]> = {
  // 스트라이크 존 (row 1~3, col 1~3)
  '1': [0, 0], '2': [0, 1], '3': [0, 2],
  '4': [1, 0], '5': [1, 1], '6': [1, 2],
  '7': [2, 0], '8': [2, 1], '9': [2, 2],
  // 볼 존 — 행열 기준으로 확장
  'B11': [-1, -1], 'B12': [-1, 0], 'B13': [-1, 1], 'B14': [-1, 2], 'B15': [-1, 3],
  'B21': [0, -1], 'B22': [0, 3],
  'B23': [1, -1], 'B24': [1, 3],
  'B25': [2, -1], 'B26': [2, 3],
  'B31': [3, -1], 'B32': [3, 0], 'B33': [3, 1], 'B34': [3, 2], 'B35': [3, 3],
}

/**
 * 두 존 ID 간 그리드 거리 (체비셰프 거리: 대각선 = 1).
 * 동일 존: 0, 인접: 1, 대각선 인접: 1, 반대쪽: 3+
 */
function zoneGridDistance(a: ZoneId, b: ZoneId): number {
  const pa = ZONE_GRID_POS[String(a)]
  const pb = ZONE_GRID_POS[String(b)]
  if (!pa || !pb) return 4  // 알 수 없는 존 → 먼 거리
  return Math.max(Math.abs(pa[0] - pb[0]), Math.abs(pa[1] - pb[1]))
}

/**
 * 예측 존 ID와 인지된 존 ID 간 근접도 (0~1).
 * 0 = 매우 멀리, 1 = 동일 존.
 */
function calcZoneProximity(predicted: ZoneId, perceived: ZoneId): number {
  const dist = zoneGridDistance(predicted, perceived)
  // 거리 0: 1.0 (동일), 1: 0.7 (인접), 2: 0.4, 3: 0.2, 4+: 0.1
  if (dist === 0) return 1.0
  if (dist === 1) return 0.7
  if (dist === 2) return 0.4
  if (dist === 3) return 0.2
  return 0.1
}

/**
 * 예측 구종과 실제 구종의 속도 계열 유사성 (0~1).
 */
function calcSpeedSimilarity(predictedType: string, actualType: string): number {
  const tiers = SWING_CONFIG.pitch_speed_tier
  const predTier = tiers[predictedType] ?? 'fast'
  const actTier = tiers[actualType] ?? 'fast'
  const key = `${predTier}-${actTier}`
  return SWING_CONFIG.speed_tier_similarity[key] ?? 0.5
}

/**
 * v2 스윙 결정.
 * prediction/perception이 없으면 기존 v1 로직 fallback.
 */
export function decideSwing(
  batter:      BattingState['batter'],
  zoneType:    ZoneType,
  count:       BattingState['count'],
  prediction?: PredictionResult,
  perception?: PerceptionResult,
): boolean {
  const contact = batter.stats.contact
  const eye = batter.stats.eye ?? SWING_CONFIG.eye_default

  // ── fallback: 예측/인식 없으면 기존 v1 로직 ──────────────
  if (!prediction || !perception) {
    const eye_modifier = (eye - 50) / 200
    const count_key = `${count.balls}-${count.strikes}`
    const count_mod = SWING_CONFIG.count_modifier[count_key] ?? 0
    const base: Record<ZoneType, number> = {
      core: 0.72, edge: 0.50, chase: 0.18, ball: 0.05, dirt: 0.04,
    }
    const p = Math.min(Math.max(base[zoneType] + count_mod + eye_modifier, 0), 1)
    return Math.random() < p
  }

  // ── v2: 인지된 존 기반 + 근접도/속도 보정 ────────────

  // 1. 인지된 존에 따른 기본 스윙 경향 (타자가 "보이는" 존 기준)
  const ZONE_SWING: Record<ZoneType, number> = {
    core: 0.72, edge: 0.55, chase: 0.22, ball: 0.06, dirt: 0.04,
  }
  let p_swing = ZONE_SWING[perception.perceived_zone]

  // 2. 예측 근접도 보정: 예측과 가까우면 스윙↑, 멀면 스윙↓
  const zone_proximity = calcZoneProximity(
    prediction.predicted_zone_id,
    perception.perceived_zone_id,
  )
  // proximity 1.0(예측 적중) → ×1.3, proximity 0.1(전혀 다름) → ×0.73
  p_swing *= 0.7 + zone_proximity * 0.6

  // 3. 구종 속도 유사성 보정: 타이밍이 맞으면 스윙↑, 안 맞으면 스윙↓
  const speed_sim = calcSpeedSimilarity(prediction.predicted_type, perception.perceived_type)
  // similarity 1.0(동일 계열) → ×1.2, similarity 0.4(반대 계열) → ×0.84
  p_swing *= 0.8 + speed_sim * 0.4

  // 4. 카운트 보정
  const count_key = `${count.balls}-${count.strikes}`
  const count_adj = (SWING_CONFIG.count_pressure[count_key] ?? 0.35) - 0.35  // 중립(0.35) 대비 차이
  p_swing += count_adj

  // 5. 스탯 보정
  // Contact: 높을수록 적응력 → 스윙 범위 확대
  p_swing += (contact / 100) * SWING_CONFIG.contact_swing_scale * 0.5
  // Eye: 볼 영역에서 스윙 억제
  const perceived_is_ball = ['ball', 'dirt'].includes(perception.perceived_zone)
  if (perceived_is_ball) {
    p_swing -= (eye / 100) * SWING_CONFIG.eye_take_scale
  }

  // 6. 2스트라이크 보호: 최소 스윙 확률 보장
  if (count.strikes >= 2) {
    p_swing = Math.max(p_swing, 0.30)
  }

  return Math.random() < Math.min(Math.max(p_swing, 0.02), 0.95)
}
