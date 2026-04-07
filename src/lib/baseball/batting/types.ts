import type { Player } from '../types/player'
import type { FamiliarityMap } from '../engine/types'
import type { HitResultDetail } from '../defence/types'

// ============================================================
// At-Bat Result
// ============================================================

export type AtBatResult =
  | 'in_progress'     // 타석 진행 중
  | 'strikeout'       // 삼진
  | 'walk'            // 볼넷
  | 'hit_by_pitch'    // 사구
  | 'single'          // 1루타
  | 'double'          // 2루타
  | 'triple'          // 3루타
  | 'home_run'        // 홈런
  | 'out'             // 인플레이 아웃
  | 'double_play'     // 병살 (포스아웃 + 타자 1루 아웃)
  | 'fielders_choice' // 야수 선택 (포스아웃 + 타자 1루 세이프)
  | 'reach_on_error'  // 실책 출루 (타수 기록, 안타 아님)
  | 'pickoff_out'     // 견제 성공 (타석 중단)
  | 'caught_stealing' // 도루 실패 (타석 중단)

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
export interface BattingResult {
  swing: boolean
  contact: boolean | null
  is_foul: boolean | null
  exit_velocity: number | null    // km/h (컨택 시 — 페어·파울 모두)
  launch_angle: number | null     // ° (컨택 시 — 페어·파울 모두)
  at_bat_result: AtBatResult
  next_count: { balls: number; strikes: number }
  at_bat_over: boolean            // 게임 루프의 타석 종료 신호
  hit_physics?: HitResultDetail   // 인플레이 타구 시 존재 — advanceRunners에 전달
  is_foul_tip?: boolean           // 파울팁 삼진 (2S + 파울팁 → 삼진 처리)
  foul_fly_error?: boolean        // 파울 플라이 수비 에러 (파울 처리, 오버레이 표시)
  foul_error_fielder?: { name: string; position_1: string }  // 에러 발생 수비수
}
