import type { ZoneType } from '../engine/types'
import type { BattingState } from './types'
import type { PredictionResult } from './predict-pitch'
import type { PerceptionResult } from './read-pitch'
import { SWING_CONFIG } from './config'

// ============================================================
// v2: 스윙 결정 — 예측 + 인식 기반
//
// 결정 요인:
//   1. 인지된 존이 스트라이크인지 볼인지
//   2. 예측과 인식의 일치 여부 (일치 → 자신감, 불일치 → 홀드 경향)
//   3. 카운트 보정 (2S: 보호 스윙↑, 3B: 소극적)
// ============================================================

// 존별 기본 스윙 경향 (인지된 존 기준)
const BASE_SWING: Record<ZoneType, number> = {
  core:  0.85,
  edge:  0.65,
  chase: 0.30,
  ball:  0.08,
  dirt:  0.05,
}

/**
 * v2 스윙 결정.
 * 기존 decideSwing과 동일한 시그니처 유지하면서, 예측/인식 정보를 추가로 받음.
 * prediction/perception이 없으면 기존 로직 fallback.
 */
export function decideSwing(
  batter:      BattingState['batter'],
  zoneType:    ZoneType,               // 실제 존 (fallback용)
  count:       BattingState['count'],
  prediction?: PredictionResult,
  perception?: PerceptionResult,
): boolean {
  // ── fallback: 예측/인식 없으면 기존 v1 로직 ──────────────
  if (!prediction || !perception) {
    const eye = batter.stats.eye ?? SWING_CONFIG.eye_default
    const eye_modifier = (eye - 50) / 200
    const count_key = `${count.balls}-${count.strikes}`
    const count_mod = SWING_CONFIG.count_modifier[count_key] ?? 0
    const p = Math.min(Math.max(BASE_SWING[zoneType] + count_mod + eye_modifier, 0), 1)
    return Math.random() < p
  }

  // ── v2: 예측 + 인식 기반 결정 ─────────────────────────

  // 1. 인지된 존 기반 스윙 경향
  let p_swing = BASE_SWING[perception.perceived_zone]

  // 2. 예측-인식 일치 보정
  //    구종 일치: 자신감 → 스윙 경향 ↑
  //    구종 불일치: 혼란 → 스윙 경향 ↓ (홀드)
  if (prediction.predicted_type === perception.perceived_type) {
    p_swing *= 1.15  // 예측 적중 → 자신감 15% 상승
  } else {
    p_swing *= 0.75  // 예측 빗남 → 25% 하락 (홀드 경향)
  }

  // 3. 카운트 보정
  const count_key = `${count.balls}-${count.strikes}`
  const count_mod = SWING_CONFIG.count_modifier[count_key] ?? 0
  p_swing += count_mod

  // 4. 2스트라이크 보호 스윙: 인지된 존이 edge/chase여도 스윙 경향 ↑
  if (count.strikes >= 2) {
    p_swing = Math.max(p_swing, 0.40)  // 최소 40% 스윙 (보호)
  }

  return Math.random() < Math.min(Math.max(p_swing, 0), 1)
}
