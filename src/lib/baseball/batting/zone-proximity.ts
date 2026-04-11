import type { ZoneId } from '../engine/types'
import { PLATE_HALF_WIDTH, ABS_MARGIN_X } from '../engine/config'

// ============================================================
// 존 경계 + 중심 좌표 계산
// 모든 존이 동일한 셀 크기 (스트라이크 존 기준)
// ============================================================

// x축: 플레이트 폭을 3등분 → 스트라이크 존 셀 폭
const CELL_WIDTH = PLATE_HALF_WIDTH * 2 / 3  // ≈ 0.144m
const PH = PLATE_HALF_WIDTH  // 0.2159m (플레이트 반폭)

// ABS 경계 = 스트라이크/볼 판정 구분선
const ABS_X = PH + ABS_MARGIN_X  // ≈ 0.468m

// x 경계 (5열, 좌→우)
// col 1~3 (스트라이크): 플레이트 기준 3등분 (투수가 노리는 건 플레이트)
// col 0,4 (볼): ABS 경계 바로 밖, 스트라이크 셀과 동일 폭
const COL_BOUNDS: Array<{ min: number; max: number }> = [
  { min: -(ABS_X + CELL_WIDTH), max: -ABS_X },  // col 0: 좌측 볼 (ABS 밖)
  { min: -PH,          max: -PH + CELL_WIDTH },  // col 1: 좌 스트라이크 (플레이트 기준)
  { min: -CELL_WIDTH/2, max: +CELL_WIDTH/2 },    // col 2: 중앙 스트라이크
  { min: PH - CELL_WIDTH, max: PH },             // col 3: 우 스트라이크
  { min: ABS_X,         max: ABS_X + CELL_WIDTH }, // col 4: 우측 볼 (ABS 밖)
]

// z 경계: 타자별 zone_bottom/zone_top에서 동적 계산
function getRowBounds(zone_bottom: number, zone_top: number): Array<{ min: number; max: number }> {
  const h = (zone_top - zone_bottom) / 3
  return [
    { min: zone_top,       max: zone_top + h },       // row 0: 상단 볼
    { min: zone_top - h,   max: zone_top },            // row 1: 상단 스트라이크
    { min: zone_top - 2*h, max: zone_top - h },        // row 2: 중단 스트라이크
    { min: zone_bottom,    max: zone_bottom + h },     // row 3: 하단 스트라이크
    { min: zone_bottom - h, max: zone_bottom },        // row 4: 하단 볼(dirt)
  ]
}

// 존 ID → (row, col) 매핑
// 스트라이크 존 1~9: col 1,2,3 (NOT 0,1,2)
// 볼존: col 0(좌) / col 4(우)
const ZONE_GRID_MAP: Record<string, [number, number]> = {
  'B11': [0,0], 'B12': [0,1], 'B13': [0,2], 'B14': [0,3], 'B15': [0,4],
  '1': [1,1], '2': [1,2], '3': [1,3],       // row 1 strike = col 1,2,3
  '4': [2,1], '5': [2,2], '6': [2,3],       // row 2
  '7': [3,1], '8': [3,2], '9': [3,3],       // row 3
  'B21': [1,0], 'B22': [1,4],               // 좌우 볼 (row 1)
  'B23': [2,0], 'B24': [2,4],               // (row 2)
  'B25': [3,0], 'B26': [3,4],               // (row 3)
  'B31': [4,0], 'B32': [4,1], 'B33': [4,2], 'B34': [4,3], 'B35': [4,4],
}

// 스트라이크 존 1~9는 col 0,1,2가 아니라 col 1,2,3에 매핑
function getZoneRowCol(zone: ZoneId): [number, number] {
  const key = String(zone)
  if (ZONE_GRID_MAP[key]) return ZONE_GRID_MAP[key]
  // 스트라이크 존 1~9: row = ceil(zone/3), col = ((zone-1)%3)+1
  if (typeof zone === 'number' && zone >= 1 && zone <= 9) {
    const row = Math.ceil(zone / 3)        // 1~3→1, 4~6→2, 7~9→3
    const col = ((zone - 1) % 3) + 1       // 1,4,7→1  2,5,8→2  3,6,9→3
    return [row, col]
  }
  return [2, 2] // fallback: 중앙
}

/**
 * 존 경계 (x_min, x_max, z_min, z_max) 반환.
 */
export function getZoneBounds(
  zone: ZoneId,
  zone_bottom: number,
  zone_top: number,
): { x_min: number; x_max: number; z_min: number; z_max: number } {
  const [row, col] = getZoneRowCol(zone)
  const colB = COL_BOUNDS[col]
  const rowBounds = getRowBounds(zone_bottom, zone_top)
  const rowB = rowBounds[row]
  return { x_min: colB.min, x_max: colB.max, z_min: rowB.min, z_max: rowB.max }
}

/**
 * 존 ID → 중심 좌표 (x, z).
 * 예측 근접도 계산 등에서 사용 (타자가 예측하는 "대표 지점").
 */
export function getZoneCenter(
  zone: ZoneId,
  zone_bottom: number,
  zone_top: number,
): { x: number; z: number } {
  const bounds = getZoneBounds(zone, zone_bottom, zone_top)
  return {
    x: (bounds.x_min + bounds.x_max) / 2,
    z: (bounds.z_min + bounds.z_max) / 2,
  }
}

// ============================================================
// 존 ID → ZoneType (좌표 없이 판별)
// ============================================================

function zoneIdToType(zone: ZoneId): 'core' | 'mid' | 'edge' | 'chase' | 'ball' | 'dirt' {
  if (typeof zone === 'number') {
    if (zone === 5) return 'core'
    if (zone === 2 || zone === 4 || zone === 6 || zone === 8) return 'mid'
    return 'edge'  // 1, 3, 7, 9
  }
  // 볼존
  if (zone.startsWith('B3')) return 'dirt'  // B31~B35
  // 코너 볼존 + 사이드 볼존 끝 = ball
  if (zone === 'B11' || zone === 'B15') return 'ball'
  if (zone === 'B21' || zone === 'B22' || zone === 'B25' || zone === 'B26') return 'ball'
  // 나머지 B1x, B23, B24 = chase
  return 'chase'
}

// ============================================================
// 편향 랜덤: 0~1 범위에서 한쪽으로 치우친 값
// direction=true → 1쪽으로 편향, false → 0쪽으로 편향
// strength 0 = 균등, 0.6 = 중간 편향, 0.9 = 강한 편향
// ============================================================

function biasedUnit(toMax: boolean, strength: number): number {
  const r = Math.random()
  if (strength <= 0) return r
  const power = Math.max(0.1, 1 - strength)
  return toMax ? Math.pow(r, power) : 1 - Math.pow(1 - r, power)
}

// ============================================================
// 존 내 의도된 타겟 좌표 선택
//
// core/mid: 셀 내 균등 (단순 위치)
// edge:     코너 모서리 쪽 편향 (페인팅)
// chase:    스트라이크 존 경계 쪽 편향 (유혹)
// ball:     셀 중앙 (확실한 볼)
// dirt:     바닥 쪽 편향 (낮은 낙차구)
// ============================================================

export function pickTargetInZone(
  zone: ZoneId,
  zone_bottom: number,
  zone_top: number,
): { x: number; z: number } {
  const bounds = getZoneBounds(zone, zone_bottom, zone_top)
  const type = zoneIdToType(zone)
  const [row] = getZoneRowCol(zone)

  const xRange = bounds.x_max - bounds.x_min
  const zRange = bounds.z_max - bounds.z_min

  switch (type) {
    case 'core':
    case 'mid': {
      // 셀 내 균등
      return {
        x: bounds.x_min + Math.random() * xRange,
        z: bounds.z_min + Math.random() * zRange,
      }
    }

    case 'edge': {
      // 코너 모서리 쪽으로 편향 (페인팅)
      // Zone 1: top-left → x_min, z_max
      // Zone 3: top-right → x_max, z_max
      // Zone 7: bottom-left → x_min, z_min
      // Zone 9: bottom-right → x_max, z_min
      const zNum = typeof zone === 'number' ? zone : 0
      const xToMax = (zNum === 3 || zNum === 9)
      const zToMax = (zNum === 1 || zNum === 3)
      return {
        x: bounds.x_min + biasedUnit(xToMax, 0.5) * xRange,
        z: bounds.z_min + biasedUnit(zToMax, 0.5) * zRange,
      }
    }

    case 'chase': {
      // 스트라이크 존 경계 쪽으로 편향 (유혹구)
      // 열 0 (좌측 chase): 경계가 x_max 쪽
      // 열 4 (우측 chase): 경계가 x_min 쪽
      // 행 0 (상단 chase): 경계가 z_min 쪽
      // 행 4 (하단 chase, dirt이지만 fallback): 경계가 z_max 쪽
      const [, col] = getZoneRowCol(zone)
      let tX = Math.random()
      let tZ = Math.random()

      if (col === 0) tX = biasedUnit(true, 0.6)   // x_max 쪽 (존 가까이)
      else if (col === 4) tX = biasedUnit(false, 0.6) // x_min 쪽
      // 중간 열은 균등

      if (row === 0) tZ = biasedUnit(false, 0.6)  // z_min 쪽 (존 가까이)

      return {
        x: bounds.x_min + tX * xRange,
        z: bounds.z_min + tZ * zRange,
      }
    }

    case 'ball': {
      // 셀 중앙 (확실한 볼 — 애매하지 않음)
      // 약간의 변동만 허용
      return {
        x: bounds.x_min + (0.3 + Math.random() * 0.4) * xRange,
        z: bounds.z_min + (0.3 + Math.random() * 0.4) * zRange,
      }
    }

    case 'dirt': {
      // 바닥 쪽 편향 (낙차구는 낮게)
      return {
        x: bounds.x_min + Math.random() * xRange,
        z: bounds.z_min + biasedUnit(false, 0.5) * zRange,  // z_min 쪽
      }
    }
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
