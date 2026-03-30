import type { PitchType, Player } from '../types/player'

// ============================================================
// Zone Types
// ============================================================

export type ZoneType = 'core' | 'edge' | 'chase' | 'ball' | 'dirt'

// 5×5 그리드 존 ID (Section 10-1, 우타자 기준)
// 1~9: 스트라이크 존 (3×3), B1x: 위 볼, B2x: 좌우 볼, B3x: 아래/dirt
export type ZoneId =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  | 'B11' | 'B12' | 'B13' | 'B14' | 'B15'
  | 'B21' | 'B22' | 'B23' | 'B24' | 'B25' | 'B26'
  | 'B31' | 'B32' | 'B33' | 'B34' | 'B35'

// ============================================================
// Familiarity
// ============================================================

// 구종 × 존별 익숙함 (0 ~ 1, 타석 내 누적)
export type FamiliarityMap = Partial<Record<PitchType, Partial<Record<string, number>>>>

// ============================================================
// Engine I/O
// ============================================================

export interface GamePitchState {
  pitcher: Player
  batter: Player
  count: { balls: number; strikes: number }
  outs: number
  runners: { first: boolean; second: boolean; third: boolean }
  recent_pitches: Array<{ type: PitchType; zone: ZoneId }>  // 최근 N구 이력
  remaining_stamina: number
  familiarity: FamiliarityMap
  inning: number
  is_scoring_position: boolean  // 득점권 주자 여부
}

export interface PitchResult {
  pitch_type: PitchType
  target_zone: ZoneId       // 투수가 노린 존
  actual_x: number          // 실제 도달 x 좌표 (m, 홈플레이트 중심 기준)
  actual_z: number          // 실제 도달 z 좌표 (m, 지면 기준)
  actual_zone: ZoneId       // 실제 도달 존
  zone_type: ZoneType       // core / edge / chase / ball / dirt
  is_strike: boolean
  is_hbp: boolean           // 사구 여부
  delivery_time: number     // 투구 홈까지 이동 시간 (s) — 타격·도루 시스템용
  needs_relief: boolean     // 강판 필요 여부
  next_stamina: number      // 투구 후 스태미나 (호출 측이 상태 업데이트)
  next_familiarity: FamiliarityMap
}
