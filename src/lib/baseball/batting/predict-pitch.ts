import type { PitchType, PitchTypeData } from '../types/player'
import type { ZoneType, ZoneId } from '../engine/types'

// ============================================================
// 투구 전 예측 — 타자가 다음 구종과 코스를 예측
//
// 구종 예측: 투수의 구종별 능력치(가중) × 반복 패널티
// 코스 예측: 카운트 기반 존 기대 분포 + 구체적 존 ID
// ============================================================

export interface PredictionResult {
  predicted_type:    PitchType
  predicted_zone:    ZoneType
  predicted_zone_id: ZoneId     // 구체적 존 ID (좌표 근접도 계산용)
  type_confidence:   number     // 예측 구종 확률 (0~1, 디버깅용)
}

/**
 * 투수의 구종 목록과 최근 투구 이력을 바탕으로 다음 투구를 예측.
 * - base_weight: 구종의 종합 능력치 (ball_power + ball_speed + ball_break)
 * - repeat_penalty: 최근 투구에서 자주 등장한 구종일수록 차감
 *   → 직전 투구와 동일: ×0.3
 *   → 최근 3구 내 등장: ×0.6
 *   → 그 외: ×1.0
 */
export function predictPitch(
  pitchTypes:     PitchTypeData[],
  recentPitches:  Array<{ type: PitchType }>,
  count:          { balls: number; strikes: number },
): PredictionResult {
  if (pitchTypes.length === 0) {
    return { predicted_type: 'fastball', predicted_zone: 'core', predicted_zone_id: 5, type_confidence: 0 }
  }

  // ── 구종 예측 확률 ──────────────────────────────────────

  const lastPitch = recentPitches.length > 0 ? recentPitches[recentPitches.length - 1].type : null
  const recent3 = new Set(recentPitches.slice(-3).map(p => p.type))

  const weights: Array<{ type: PitchType; w: number }> = pitchTypes.map(pt => {
    // 종합 능력치 기반 가중치
    const ability = pt.ball_power + pt.ball_speed + pt.ball_break
    let w = ability

    // 반복 패널티
    if (pt.type === lastPitch) {
      w *= 0.3   // 직전 투구와 동일 → 70% 차감
    } else if (recent3.has(pt.type)) {
      w *= 0.6   // 최근 3구 내 등장 → 40% 차감
    }

    return { type: pt.type, w }
  })

  // 정규화
  const totalW = weights.reduce((s, e) => s + e.w, 0)
  if (totalW <= 0) {
    return { predicted_type: pitchTypes[0].type, predicted_zone: 'core', predicted_zone_id: 5, type_confidence: 0 }
  }

  // 가중치 기반 랜덤 선택
  let roll = Math.random() * totalW
  let predicted_type: PitchType = weights[0].type
  let type_confidence = 0

  for (const { type, w } of weights) {
    roll -= w
    if (roll <= 0) {
      predicted_type = type
      type_confidence = w / totalW
      break
    }
  }

  // ── 코스 예측 ──────────────────────────────────────────

  const predicted_zone = predictZone(count)
  const predicted_zone_id = predictZoneId(predicted_zone)

  return { predicted_type, predicted_zone, predicted_zone_id, type_confidence }
}

/**
 * 카운트 기반 존 예측:
 * - 투수 유리 (0-2, 1-2): chase/ball 기대 ↑
 * - 타자 유리 (3-0, 3-1): core/edge 기대 ↑
 * - 중립: core/edge 중심
 */
function predictZone(count: { balls: number; strikes: number }): ZoneType {
  const { balls, strikes } = count

  // 투수 유리: 낭비구/chase 기대
  if (strikes === 2 && balls <= 1) {
    const r = Math.random()
    if (r < 0.40) return 'chase'
    if (r < 0.60) return 'ball'
    if (r < 0.80) return 'edge'
    return 'core'
  }

  // 타자 유리: 스트라이크 존 기대
  if (balls >= 3 && strikes <= 1) {
    const r = Math.random()
    if (r < 0.50) return 'core'
    if (r < 0.80) return 'edge'
    return 'chase'
  }

  // 중립
  const r = Math.random()
  if (r < 0.35) return 'core'
  if (r < 0.65) return 'edge'
  if (r < 0.85) return 'chase'
  return 'ball'
}

/**
 * 존 타입에서 구체적 존 ID를 랜덤 선택.
 * 타자가 "인코스 높은 쪽"처럼 구체적인 위치를 노리는 것을 모델링.
 */
function predictZoneId(zoneType: ZoneType): ZoneId {
  const ZONE_IDS_BY_TYPE: Record<ZoneType, ZoneId[]> = {
    core:  [5],                 // 한복판
    edge:  [1, 2, 3, 4, 6, 7, 8, 9],  // mid + edge (코너 포함)
    chase: ['B12', 'B13', 'B14', 'B21', 'B22', 'B23', 'B24', 'B25', 'B26'],
    ball:  ['B11', 'B15', 'B31', 'B32', 'B33', 'B34', 'B35'],
    dirt:  ['B31', 'B32', 'B33', 'B34', 'B35'],
  }
  const candidates = ZONE_IDS_BY_TYPE[zoneType]
  return candidates[Math.floor(Math.random() * candidates.length)]
}
