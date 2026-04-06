import type { Player }         from '../types/player'
import type { AtBatResult }    from './types'
import type { HitResultDetail } from '../defence/types'
import {
  selectDirectionAngle,
  calcBattedBallPhysics,
  classifyBallType,
} from '../defence/ball-physics'
import {
  findResponsibleFielder,
  calcCatchProbability,
} from '../defence/catch-probability'
import { ERROR_COEFF } from '../game/config'

// ============================================================
// 방향별 펜스 거리
// ============================================================

/**
 * 방향각(θ_deg)에 따른 펜스 거리 계산.
 * KBO/MLB 구장 평균 기준 기본값: CF 122m, 코너 97m (선형 보간)
 * 구장별 override: N1 피처에서 Stadium 타입으로 처리 예정.
 *
 * @param theta_deg  방향각 (-42~+42°, 0=중견수)
 * @param fence_cf   중견수 펜스 거리 (기본 122m)
 * @param fence_corner 코너 펜스 거리 (기본 97m)
 */
export function fenceDistance(
  theta_deg:    number,
  fence_cf      = 122,
  fence_corner  = 97,
): number {
  return fence_cf - (fence_cf - fence_corner) * (Math.abs(theta_deg) / 42)
}

// ============================================================
// 거리 기반 히트 종류 결정
// ============================================================

function resolveHitType(
  range: number,
): Exclude<AtBatResult, 'in_progress' | 'strikeout' | 'walk' | 'hit_by_pitch' | 'home_run' | 'out'> {
  // range < 45m: 내야 ~ 얕은 외야 → 단타
  // (롤링 거리 포함 유효 거리 기준 재조정: 이전 36m → 45m)
  if (range < 45) return 'single'

  // 45m ≤ range < 70m: 중간 외야 (80% 단타 / 20% 2루타)
  if (range < 70) {
    return Math.random() < 0.80 ? 'single' : 'double'
  }

  // range ≥ 70m: 깊은 외야
  const r = Math.random()
  if (r < 0.30) return 'single'
  if (r < 0.90) return 'double'
  return 'triple'
}

// ============================================================
// M7: 타구 결과 판정
// 수비수 위치 + Defence 스탯 + 타구 물리 기반
// ============================================================

export function resolveHitResult(
  exit_velocity: number,
  launch_angle:  number,
  batter:        Player,
  fielders:      Player[],
): HitResultDetail {
  // 1. 방향각 결정
  const theta_h = selectDirectionAngle(batter)

  // 2. 타구 물리 계산
  const physics = calcBattedBallPhysics(exit_velocity, launch_angle, theta_h)

  // 3. 담당 수비수 선택 (홈런 포함 항상 계산 — fielder/pos 반환에 필요)
  const { fielder, dist } = findResponsibleFielder(physics.landing, fielders)

  // 실제 공 픽업 위치 = 착지 지점 (외야수가 이 위치까지 달려와서 잡음)
  const fielder_pos   = { x: physics.landing.field_x, y: physics.landing.field_y }

  const t_ball_travel = physics.t_bounce
  // 외야수가 착지 지점까지 달려오는 시간 포함
  const fielder_approach_speed = 5.5 + (fielder.stats.defence / 100) * 1.5  // 5.5–7.0 m/s
  const t_approach    = dist / fielder_approach_speed
  const t_fielding    = t_ball_travel + t_approach + 0.3
  const is_infield    = physics.range < 36

  // 4. 타구 종류 분류 (홈런 포함 모든 결과에 ball_type 설정)
  const ballType = classifyBallType(launch_angle)

  // 5. 홈런 판정
  if (physics.range >= fenceDistance(theta_h)) {
    return { result: 'home_run', fielder, fielder_pos, t_fielding, t_ball_travel, is_infield: false, range: physics.range, ball_type: ballType, theta_h }
  }

  // 6. 포구 확률 계산
  const p_out = calcCatchProbability(ballType, dist, physics.v_roll_0, physics.t_bounce, fielder)

  // 7. 아웃/실책/안타 3분법 판정
  const p_error = p_out * ERROR_COEFF
  const roll    = Math.random()

  if (roll < p_out) {
    // 포구 성공 → 아웃
    const catch_setup_time = p_out >= 0.5 ? 0.2 : 0.4
    return { result: 'out', fielder, fielder_pos, t_fielding, t_ball_travel, is_infield, range: physics.range, ball_type: ballType, theta_h, catch_setup_time }
  }
  if (roll < p_out + p_error) {
    // 실책 출루
    const roe_t_fielding = is_infield ? t_fielding + 3.0 : t_fielding
    return { result: 'reach_on_error', fielder, fielder_pos, t_fielding: roe_t_fielding, t_ball_travel, is_infield, range: physics.range, ball_type: ballType, theta_h, is_error: true }
  }

  // 8. 히트 종류 결정
  const result = resolveHitType(physics.range)
  const hit_t_fielding = is_infield ? t_fielding + 3.0 : t_fielding
  return { result, fielder, fielder_pos, t_fielding: hit_t_fielding, t_ball_travel, is_infield, range: physics.range, ball_type: ballType, theta_h }
}
