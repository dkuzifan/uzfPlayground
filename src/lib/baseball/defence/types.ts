// ============================================================
// 수비 엔진 공통 타입
// ============================================================

export interface FieldCoords {
  field_x: number   // m, 홈 기준 좌우 (1루 방향 +)
  field_y: number   // m, 홈→중견수 방향 +
}

export interface BallPhysicsResult {
  range:    number        // Magnus 보정 착지 거리 (m)
  v_roll_0: number        // 첫 바운드 직후 수평 속도 (m/s)
  t_bounce: number        // 첫 바운드 시간 (s)
  landing:  FieldCoords   // 착지 필드 좌표
}

// LA 기준 타구 분류 — 포구 확률 로직 분기에 사용
export type BallType = 'popup' | 'fly' | 'line_drive' | 'grounder'

// ============================================================
// HitResultDetail — resolveHitResult 반환 / advanceRunners 입력
// t_ball_travel = BallPhysicsResult.t_bounce (공 비행 시간)
// ============================================================

import type { Player } from '../types/player'
import type { AtBatResult } from '../batting/types'

export interface HitResultDetail {
  result:           AtBatResult
  fielder:          Player
  fielder_pos:      { x: number; y: number }
  t_fielding:       number        // t_ball_travel + 0.3s
  t_ball_travel:    number        // = t_bounce
  is_infield:       boolean       // range < 36m
  ball_type?:        BallType      // 타구 분류 (항상 설정)
  theta_h?:          number        // 방향각 (°): 0=중견수, +=우측, -=좌측
  catch_setup_time?: number       // 포구 난이도별 송구 준비 시간 (일반: 0.2s, 어려운 포구: 0.4s)
  is_error?:         boolean       // true = 포구 실책 (reach_on_error)
}
