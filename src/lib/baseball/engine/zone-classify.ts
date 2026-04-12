import type { Player } from '../types/player'
import type { ZoneId, ZoneType } from './types'
import { PLATE_HALF_WIDTH } from './config'

// ============================================================
// 7×7 그리드 좌표 범위 정의
//
// X축: 홈플레이트 중심 기준 (좌 = -, 우 = +), 우타자 뷰
//   col 0 (ball):   x < -(PH + CELL_W)
//   col 1 (chase):  -(PH + CELL_W) ≤ x < -PH
//   col 2~4 (strike): 플레이트 3등분
//   col 5 (chase):  PH < x ≤ PH + CELL_W
//   col 6 (ball):   x > PH + CELL_W
//
// Z축: 지면 기준 (m), batter.zone_bottom ~ batter.zone_top
//   row 0 (ball):   z > zone_top + h
//   row 1 (chase):  zone_top < z ≤ zone_top + h
//   row 2~4 (strike): 존 3등분
//   row 5 (chase):  zone_bottom - h ≤ z < zone_bottom
//   row 6 (ball):   z < zone_bottom - h
//
// 스트라이크 판정: 투구 좌표가 플레이트 × 스트라이크 존 내부일 때만 strike
//   ±PH × (zone_bottom ~ zone_top)
// ============================================================

const PH = PLATE_HALF_WIDTH
const THIRD = PH / 3         // 플레이트 균등 3등분 경계 (= PH/3 ≈ 0.072m)
const CELL_W = 2 * PH / 3    // 스트라이크 셀 폭 ≈ 0.144m
const X_CHASE = PH + CELL_W  // chase/ball 경계 (스트라이크 셀 1칸분)

// 7×7 존 ID 배치 (row 0~6 × col 0~6)
const ZONE_GRID: ZoneId[][] = [
  //  col0    col1    col2   col3   col4    col5    col6
  ['Z00', 'Z01', 'Z02', 'Z03', 'Z04', 'Z05', 'Z06'],  // row0: 상단 ball
  ['Z10', 'Z11', 'Z12', 'Z13', 'Z14', 'Z15', 'Z16'],  // row1: 상단 chase+ball
  ['Z20', 'Z21',     1,     2,     3, 'Z25', 'Z26'],  // row2: 상단 스트라이크
  ['Z30', 'Z31',     4,     5,     6, 'Z35', 'Z36'],  // row3: 중단 스트라이크
  ['Z40', 'Z41',     7,     8,     9, 'Z45', 'Z46'],  // row4: 하단 스트라이크
  ['Z50', 'Z51', 'Z52', 'Z53', 'Z54', 'Z55', 'Z56'],  // row5: 하단 chase+ball
  ['Z60', 'Z61', 'Z62', 'Z63', 'Z64', 'Z65', 'Z66'],  // row6: 하단 ball
]

// Chase 존 집합 (스트라이크 존 1칸 인접, 대각 포함)
const CHASE_SET = new Set<ZoneId>([
  'Z11', 'Z12', 'Z13', 'Z14', 'Z15',
  'Z21', 'Z25',
  'Z31', 'Z35',
  'Z41', 'Z45',
  'Z51', 'Z52', 'Z53', 'Z54', 'Z55',
])

// ZoneId → ZoneType 매핑
function getZoneType(zone: ZoneId): ZoneType {
  if (typeof zone === 'number') {
    // 3단계 분류: core(한복판) / mid(십자) / edge(코너)
    if (zone === 5) return 'core'
    if (zone === 2 || zone === 4 || zone === 6 || zone === 8) return 'mid'
    return 'edge'  // 1, 3, 7, 9
  }
  if (CHASE_SET.has(zone)) return 'chase'
  return 'ball'
}

// ============================================================
// 7×7 존 판정
// ============================================================

export function classifyZone(
  actual_x: number,
  actual_z: number,
  batter: Player
): { zone_id: ZoneId; zone_type: ZoneType; is_strike: boolean } {
  const { zone_bottom, zone_top } = batter

  const zoneHeight = zone_top - zone_bottom
  const h = zoneHeight / 3  // 스트라이크 셀 높이

  // 스트라이크 판정: 좌표가 플레이트 × 존 내부일 때만
  const is_strike =
    actual_x >= -PH && actual_x <= PH &&
    actual_z >= zone_bottom && actual_z <= zone_top

  // 행 결정 (0~6)
  let row: number
  if (actual_z > zone_top + h) {
    row = 0        // 상단 ball
  } else if (actual_z > zone_top) {
    row = 1        // 상단 chase
  } else if (actual_z > zone_top - h) {
    row = 2        // 상단 스트라이크
  } else if (actual_z > zone_bottom + h) {
    row = 3        // 중단 스트라이크
  } else if (actual_z >= zone_bottom) {
    row = 4        // 하단 스트라이크
  } else if (actual_z >= zone_bottom - h) {
    row = 5        // 하단 chase
  } else {
    row = 6        // 하단 ball
  }

  // 열 결정 (0~6)
  let col: number
  if (actual_x < -X_CHASE) {
    col = 0        // 좌측 ball
  } else if (actual_x < -PH) {
    col = 1        // 좌측 chase
  } else if (actual_x < -THIRD) {
    col = 2        // 좌 스트라이크
  } else if (actual_x <= THIRD) {
    col = 3        // 중앙 스트라이크
  } else if (actual_x <= PH) {
    col = 4        // 우 스트라이크
  } else if (actual_x <= X_CHASE) {
    col = 5        // 우측 chase
  } else {
    col = 6        // 우측 ball
  }

  const zone_id = ZONE_GRID[row][col]
  const zone_type = getZoneType(zone_id)

  return { zone_id, zone_type, is_strike }
}
