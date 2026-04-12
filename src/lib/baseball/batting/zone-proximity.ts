import type { ZoneId, ZoneType } from '../engine/types'
import { PLATE_HALF_WIDTH, ABS_MARGIN_X } from '../engine/config'

// ============================================================
// 7×7 존 경계 + 중심 좌표 계산
// ============================================================

const PH = PLATE_HALF_WIDTH   // 0.2159m
const THIRD = PH / 3          // 플레이트 균등 3등분 경계 ≈ 0.072m
const CELL_W = 2 * PH / 3     // 스트라이크 셀 폭 ≈ 0.144m
const X_CHASE = PH + CELL_W   // chase/ball 경계 (셀 1칸분) ≈ 0.360m

// x축 7열 경계
// col 0: ball (< -X_CHASE)
// col 1: chase (-X_CHASE ~ -PH)
// col 2: left strike (-PH ~ -THIRD)
// col 3: center (-THIRD ~ +THIRD)
// col 4: right strike (+THIRD ~ +PH)
// col 5: chase (+PH ~ +X_CHASE)
// col 6: ball (> +X_CHASE)
const CHASE_WIDTH = X_CHASE - PH   // = ABS_MARGIN_X ≈ 0.2525m
const BALL_WIDTH = CHASE_WIDTH      // ball 셀도 동일 폭 사용

const COL_BOUNDS: Array<{ min: number; max: number }> = [
  { min: -(X_CHASE + BALL_WIDTH), max: -X_CHASE },  // col 0: 좌측 ball
  { min: -X_CHASE,                max: -PH },        // col 1: 좌측 chase
  { min: -PH,                     max: -THIRD },     // col 2: 좌 스트라이크
  { min: -THIRD,                  max: +THIRD },     // col 3: 중앙 스트라이크
  { min: +THIRD,                  max: +PH },        // col 4: 우 스트라이크
  { min: +PH,                     max: +X_CHASE },   // col 5: 우측 chase
  { min: +X_CHASE,                max: X_CHASE + BALL_WIDTH },  // col 6: 우측 ball
]

// z축 7행 경계: 타자별 동적 계산
function getRowBounds(zone_bottom: number, zone_top: number): Array<{ min: number; max: number }> {
  const h = (zone_top - zone_bottom) / 3
  return [
    { min: zone_top + h,     max: zone_top + 2 * h },    // row 0: 상단 ball
    { min: zone_top,         max: zone_top + h },         // row 1: 상단 chase
    { min: zone_top - h,     max: zone_top },             // row 2: 상단 스트라이크
    { min: zone_bottom + h,  max: zone_top - h },         // row 3: 중단 스트라이크
    { min: zone_bottom,      max: zone_bottom + h },      // row 4: 하단 스트라이크
    { min: zone_bottom - h,  max: zone_bottom },          // row 5: 하단 chase
    { min: zone_bottom - 2 * h, max: zone_bottom - h },   // row 6: 하단 ball
  ]
}

// 존 ID → (row, col) 매핑
const ZONE_GRID_MAP: Record<string, [number, number]> = {
  // row 0: 상단 ball
  'Z00': [0,0], 'Z01': [0,1], 'Z02': [0,2], 'Z03': [0,3], 'Z04': [0,4], 'Z05': [0,5], 'Z06': [0,6],
  // row 1: 상단 chase+ball
  'Z10': [1,0], 'Z11': [1,1], 'Z12': [1,2], 'Z13': [1,3], 'Z14': [1,4], 'Z15': [1,5], 'Z16': [1,6],
  // row 2: 좌우 + strike
  'Z20': [2,0], 'Z21': [2,1], '1': [2,2], '2': [2,3], '3': [2,4], 'Z25': [2,5], 'Z26': [2,6],
  // row 3
  'Z30': [3,0], 'Z31': [3,1], '4': [3,2], '5': [3,3], '6': [3,4], 'Z35': [3,5], 'Z36': [3,6],
  // row 4
  'Z40': [4,0], 'Z41': [4,1], '7': [4,2], '8': [4,3], '9': [4,4], 'Z45': [4,5], 'Z46': [4,6],
  // row 5: 하단 chase+ball
  'Z50': [5,0], 'Z51': [5,1], 'Z52': [5,2], 'Z53': [5,3], 'Z54': [5,4], 'Z55': [5,5], 'Z56': [5,6],
  // row 6: 하단 ball
  'Z60': [6,0], 'Z61': [6,1], 'Z62': [6,2], 'Z63': [6,3], 'Z64': [6,4], 'Z65': [6,5], 'Z66': [6,6],
}

function getZoneRowCol(zone: ZoneId): [number, number] {
  const key = String(zone)
  if (ZONE_GRID_MAP[key]) return ZONE_GRID_MAP[key]
  return [3, 3] // fallback: 중앙
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

// Chase 존 집합 (스트라이크 존 1칸 인접, 대각 포함)
const CHASE_SET = new Set<string>([
  'Z11', 'Z12', 'Z13', 'Z14', 'Z15',
  'Z21', 'Z25',
  'Z31', 'Z35',
  'Z41', 'Z45',
  'Z51', 'Z52', 'Z53', 'Z54', 'Z55',
])

function zoneIdToType(zone: ZoneId): ZoneType {
  if (typeof zone === 'number') {
    if (zone === 5) return 'core'
    if (zone === 2 || zone === 4 || zone === 6 || zone === 8) return 'mid'
    return 'edge'  // 1, 3, 7, 9
  }
  if (CHASE_SET.has(zone)) return 'chase'
  return 'ball'
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
// ============================================================

export function pickTargetInZone(
  zone: ZoneId,
  zone_bottom: number,
  zone_top: number,
): { x: number; z: number } {
  const bounds = getZoneBounds(zone, zone_bottom, zone_top)
  const type = zoneIdToType(zone)
  const [row, col] = getZoneRowCol(zone)

  const xRange = bounds.x_max - bounds.x_min
  const zRange = bounds.z_max - bounds.z_min

  switch (type) {
    case 'core':
    case 'mid': {
      return {
        x: bounds.x_min + Math.random() * xRange,
        z: bounds.z_min + Math.random() * zRange,
      }
    }

    case 'edge': {
      // 코너 모서리 쪽으로 편향 (페인팅)
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
      let tX = Math.random()
      let tZ = Math.random()

      // x 방향: 존 쪽으로 편향
      if (col <= 1) tX = biasedUnit(true, 0.6)       // x_max 쪽 (존 가까이)
      else if (col >= 5) tX = biasedUnit(false, 0.6)  // x_min 쪽

      // z 방향: 존 쪽으로 편향
      if (row <= 1) tZ = biasedUnit(false, 0.6)       // z_min 쪽 (존 가까이)
      else if (row >= 5) tZ = biasedUnit(true, 0.6)    // z_max 쪽

      return {
        x: bounds.x_min + tX * xRange,
        z: bounds.z_min + tZ * zRange,
      }
    }

    case 'ball': {
      // 셀 중앙 (확실한 볼 — 애매하지 않음)
      return {
        x: bounds.x_min + (0.3 + Math.random() * 0.4) * xRange,
        z: bounds.z_min + (0.3 + Math.random() * 0.4) * zRange,
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
