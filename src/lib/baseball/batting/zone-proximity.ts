import type { ZoneId } from '../engine/types'

// ============================================================
// 존 ID → 중심 좌표 변환 + 좌표 거리 계산
// 스윙 결정과 컨택 품질에서 공통 사용
// ============================================================

// 스트라이크 존 x 중심 (3열)
const X_CENTERS = [-0.14, 0.0, 0.14]
const X_LEFT_BALL  = -0.58
const X_RIGHT_BALL =  0.58

/**
 * 존 ID → 중심 좌표 (x, z).
 * 스트라이크 존 z는 타자별로 다르므로 zone_bottom/zone_top 필요.
 */
export function getZoneCenter(
  zone: ZoneId,
  zone_bottom: number,
  zone_top: number,
): { x: number; z: number } {
  const h = (zone_top - zone_bottom) / 3
  const zCenters = [
    zone_top    - h / 2,   // 상단 행
    zone_bottom + h * 1.5, // 중단 행
    zone_bottom + h / 2,   // 하단 행
  ]
  const zHigh = zone_top + 0.25
  const zLow  = zone_bottom - 0.25

  switch (zone) {
    case 1: return { x: X_CENTERS[0], z: zCenters[0] }
    case 2: return { x: X_CENTERS[1], z: zCenters[0] }
    case 3: return { x: X_CENTERS[2], z: zCenters[0] }
    case 4: return { x: X_CENTERS[0], z: zCenters[1] }
    case 5: return { x: X_CENTERS[1], z: zCenters[1] }
    case 6: return { x: X_CENTERS[2], z: zCenters[1] }
    case 7: return { x: X_CENTERS[0], z: zCenters[2] }
    case 8: return { x: X_CENTERS[1], z: zCenters[2] }
    case 9: return { x: X_CENTERS[2], z: zCenters[2] }
    case 'B11': return { x: X_LEFT_BALL,   z: zHigh }
    case 'B12': return { x: X_CENTERS[0],  z: zHigh }
    case 'B13': return { x: X_CENTERS[1],  z: zHigh }
    case 'B14': return { x: X_CENTERS[2],  z: zHigh }
    case 'B15': return { x: X_RIGHT_BALL,  z: zHigh }
    case 'B21': return { x: X_LEFT_BALL,   z: zCenters[0] }
    case 'B22': return { x: X_RIGHT_BALL,  z: zCenters[0] }
    case 'B23': return { x: X_LEFT_BALL,   z: zCenters[1] }
    case 'B24': return { x: X_RIGHT_BALL,  z: zCenters[1] }
    case 'B25': return { x: X_LEFT_BALL,   z: zCenters[2] }
    case 'B26': return { x: X_RIGHT_BALL,  z: zCenters[2] }
    case 'B31': return { x: X_LEFT_BALL,   z: zLow }
    case 'B32': return { x: X_CENTERS[0],  z: zLow }
    case 'B33': return { x: X_CENTERS[1],  z: zLow }
    case 'B34': return { x: X_CENTERS[2],  z: zLow }
    case 'B35': return { x: X_RIGHT_BALL,  z: zLow }
    default:    return { x: 0, z: zCenters[1] }
  }
}

/**
 * 예측 존 중심과 실제 투구 좌표 간 유클리드 거리 (미터).
 */
export function calcCoordinateDistance(
  predicted_zone_id: ZoneId,
  actual_x:          number,
  actual_z:          number,
  zone_bottom:       number,
  zone_top:          number,
): number {
  const center = getZoneCenter(predicted_zone_id, zone_bottom, zone_top)
  const dx = center.x - actual_x
  const dz = center.z - actual_z
  return Math.sqrt(dx * dx + dz * dz)
}
