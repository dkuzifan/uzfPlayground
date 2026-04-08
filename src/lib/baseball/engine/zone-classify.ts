import type { Player } from '../types/player'
import type { ZoneId, ZoneType } from './types'
import { PLATE_HALF_WIDTH, ABS_MARGIN_X, ABS_MARGIN_Z } from './config'

// ============================================================
// 5×5 그리드 좌표 범위 정의
//
// X축: 홈플레이트 중심 기준 (좌 = -, 우 = +), 우타자 뷰
//   열1(좌): x < -PLATE_HALF_WIDTH
//   열2:     -PLATE_HALF_WIDTH ≤ x < -PLATE_HALF_WIDTH/3
//   열3(중): |x| < PLATE_HALF_WIDTH/3
//   열4:     PLATE_HALF_WIDTH/3 ≤ x < PLATE_HALF_WIDTH
//   열5(우): x ≥ PLATE_HALF_WIDTH
//
// Z축: 지면 기준 (m), batter.zone_bottom ~ batter.zone_top = 스트라이크 존
//   행1(상): z > zone_top
//   행2:     zone_top ≥ z > zone_top - (zone_height/3)
//   행3:     ...
//   행4:     ...
//   행5(하): z ≤ zone_bottom
// ============================================================

// 5×5 존 ID 배치 (행1~5 × 열1~5)
// 행1 = 상단 볼존, 행2~4 = 스트라이크 존 3행, 행5 = 하단 볼존
// 열1, 열5 = 좌우 볼존, 열2~4 = 스트라이크 존 3열
const ZONE_GRID: ZoneId[][] = [
  //  col1    col2    col3    col4    col5
  ['B11',  'B12',  'B13',  'B14',  'B15'],  // row1: 상단 볼
  ['B21',     1,      2,      3,   'B22'],  // row2: 상단 스트라이크
  ['B23',     4,      5,      6,   'B24'],  // row3: 중단 스트라이크
  ['B25',     7,      8,      9,   'B26'],  // row4: 하단 스트라이크
  ['B31',  'B32',  'B33',  'B34',  'B35'],  // row5: 하단 볼(dirt)
]

// ZoneId → ZoneType 매핑
function getZoneType(zone: ZoneId): ZoneType {
  if (typeof zone === 'number') {
    // ZoneType 분류: core(중앙+십자) / edge(코너)
    // 투구 전략에서는 별도 3단계 사용 (zone-select.ts: CORE/MID/EDGE_ZONES)
    if (zone === 5 || zone === 2 || zone === 4 || zone === 6 || zone === 8) return 'core'
    return 'edge'  // 1, 3, 7, 9
  }
  // 볼 존
  if (zone.startsWith('B3')) return 'dirt'  // 하단 볼 (바운드 가능)
  // B1x (상단 볼): 상단 코너(B11,B15) = ball, 나머지 = chase
  // B2x (좌우 볼): 좌우 끝(B21,B22,B25,B26) = ball (스트라이크 존 옆 열), 나머지(B23,B24) = chase
  if (zone === 'B11' || zone === 'B15' || zone === 'B21' || zone === 'B22' || zone === 'B25' || zone === 'B26') return 'ball'
  return 'chase'
}

// ============================================================
// M6: ABS 존 판정
// ============================================================

export function classifyZone(
  actual_x: number,
  actual_z: number,
  batter: Player
): { zone_id: ZoneId; zone_type: ZoneType; is_strike: boolean } {
  const { zone_bottom, zone_top } = batter

  const zoneHeight = zone_top - zone_bottom
  const rowHeight  = zoneHeight / 3

  // ABS 확장 경계
  const strikeXMin = -(PLATE_HALF_WIDTH + ABS_MARGIN_X)
  const strikeXMax =  (PLATE_HALF_WIDTH + ABS_MARGIN_X)
  const strikeZMin = zone_bottom - ABS_MARGIN_Z
  const strikeZMax = zone_top    + ABS_MARGIN_Z

  const is_strike =
    actual_x >= strikeXMin && actual_x <= strikeXMax &&
    actual_z >= strikeZMin && actual_z <= strikeZMax

  // 행 결정 (0~4)
  let row: number
  if (actual_z > zone_top + ABS_MARGIN_Z) {
    row = 0  // 상단 볼
  } else if (actual_z > zone_bottom + rowHeight * 2) {
    row = 1  // 상단 스트라이크
  } else if (actual_z > zone_bottom + rowHeight) {
    row = 2  // 중단 스트라이크
  } else if (actual_z >= zone_bottom - ABS_MARGIN_Z) {
    row = 3  // 하단 스트라이크
  } else {
    row = 4  // 하단 볼 (dirt)
  }

  // 열 결정 (0~4)
  const third = PLATE_HALF_WIDTH / 1.5  // ≈ 홈플레이트 폭 3등분
  let col: number
  if (actual_x < -(PLATE_HALF_WIDTH + ABS_MARGIN_X)) {
    col = 0  // 좌측 볼
  } else if (actual_x < -third) {
    col = 1
  } else if (actual_x <= third) {
    col = 2
  } else if (actual_x <= PLATE_HALF_WIDTH + ABS_MARGIN_X) {
    col = 3
  } else {
    col = 4  // 우측 볼
  }

  const zone_id = ZONE_GRID[row][col]
  let zone_type = getZoneType(zone_id)

  // 거리 기반 ball 재분류: 존 경계에서 많이 벗어난 투구 → chase → ball 승격
  // chase로 분류된 투구 중 존 경계에서 0.15m(약 6인치) 이상 벗어나면 ball
  if (zone_type === 'chase') {
    const x_excess = Math.max(0, Math.abs(actual_x) - strikeXMax)
    const z_excess_hi = Math.max(0, actual_z - strikeZMax)
    const z_excess_lo = Math.max(0, strikeZMin - actual_z)
    const total_excess = Math.max(x_excess, z_excess_hi, z_excess_lo)
    if (total_excess > 0.15) zone_type = 'ball'
  }

  return { zone_id, zone_type, is_strike }
}
