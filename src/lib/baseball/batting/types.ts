import type { Player } from '../types/player'
import type { FamiliarityMap } from '../engine/types'

// ============================================================
// At-Bat Result
// ============================================================

export type AtBatResult =
  | 'in_progress'   // 타석 진행 중
  | 'strikeout'     // 삼진
  | 'walk'          // 볼넷
  | 'hit_by_pitch'  // 사구
  | 'single'        // 1루타
  | 'double'        // 2루타
  | 'triple'        // 3루타
  | 'home_run'      // 홈런
  | 'out'           // 인플레이 아웃

// ============================================================
// Engine I/O
// ============================================================

// hitBall()에 넘기는 타자 측 상태
export interface BattingState {
  pitcher: Player               // 구종별 스탯(구위/구속/변화) 참조용
  batter: Player
  count: { balls: number; strikes: number }
  outs: number
  runners: { first: boolean; second: boolean; third: boolean }
  familiarity: FamiliarityMap   // throwPitch().next_familiarity를 그대로 전달
  inning: number
}

// hitBall() 반환값
// null 필드: 해당 분기에 도달하지 않은 경우
//   - take 시: contact/is_foul/exit_velocity/launch_angle = null
//   - 헛스윙 시: is_foul/exit_velocity/launch_angle = null
//   - 파울 시: exit_velocity/launch_angle = null
export interface BattingResult {
  swing: boolean
  contact: boolean | null
  is_foul: boolean | null
  exit_velocity: number | null    // km/h (페어 컨택 시만)
  launch_angle: number | null     // ° (페어 컨택 시만)
  at_bat_result: AtBatResult
  next_count: { balls: number; strikes: number }
  at_bat_over: boolean            // 게임 루프의 타석 종료 신호
}
