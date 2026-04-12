import type { PitchType, Player } from '../types/player'

// ============================================================
// Zone Types
// ============================================================

export type ZoneType = 'core' | 'mid' | 'edge' | 'chase' | 'ball'

// 7×7 그리드 존 ID (우타자 기준)
// 1~9: 스트라이크 존 (3×3, rows 2-4 × cols 2-4)
// Z{row}{col}: 볼존 (chase + ball)
//   chase (16): 스트라이크 존 1칸 인접 (대각 포함)
//   ball  (24): 2칸 이상 떨어진 외곽
export type ZoneId =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  | 'Z00' | 'Z01' | 'Z02' | 'Z03' | 'Z04' | 'Z05' | 'Z06'
  | 'Z10' | 'Z11' | 'Z12' | 'Z13' | 'Z14' | 'Z15' | 'Z16'
  | 'Z20' | 'Z21' | 'Z25' | 'Z26'
  | 'Z30' | 'Z31' | 'Z35' | 'Z36'
  | 'Z40' | 'Z41' | 'Z45' | 'Z46'
  | 'Z50' | 'Z51' | 'Z52' | 'Z53' | 'Z54' | 'Z55' | 'Z56'
  | 'Z60' | 'Z61' | 'Z62' | 'Z63' | 'Z64' | 'Z65' | 'Z66'

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
  zone_type: ZoneType       // core / mid / edge / chase / ball
  is_strike: boolean
  is_hbp: boolean           // 사구 여부
  delivery_time: number     // 투구 홈까지 이동 시간 (s) — 타격·도루 시스템용
  needs_relief: boolean     // 강판 필요 여부
  next_stamina: number      // 투구 후 스태미나 (호출 측이 상태 업데이트)
  next_familiarity: FamiliarityMap
  // Step 9 — 3-0 구위 트레이드오프로 감소된 실효 ball_power.
  // 미지정이면 pitchData.ball_power 그대로 사용.
  effective_ball_power?: number
}
