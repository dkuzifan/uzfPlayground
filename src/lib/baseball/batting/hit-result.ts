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
  findGrounderInterceptor,
  calcGrounderCatchProb,
} from '../defence/catch-probability'
import { ERROR_COEFF } from '../game/config'
import { PHYSICS_CONFIG } from '../defence/config'

// ============================================================
// 방향별 펜스 거리
// ============================================================

/**
 * 방향각(θ_deg)에 따른 펜스 거리 계산.
 * KBO/MLB 구장 평균 기준 기본값: CF 122m, 코너 97m (선형 보간)
 * 구장별 override: N1 피처에서 Stadium 타입으로 처리 예정.
 */
export function fenceDistance(
  theta_deg:    number,
  fence_cf      = 122,
  fence_corner  = 97,
): number {
  const clampedTheta = Math.min(Math.abs(theta_deg), PHYSICS_CONFIG.FAIR_ANGLE)
  return fence_cf - (fence_cf - fence_corner) * (clampedTheta / PHYSICS_CONFIG.FAIR_ANGLE)
}

// ============================================================
// 에러 시 줍는 시간 계산
// ============================================================

function calcPickupTime(fielder: Player): number {
  return PHYSICS_CONFIG.error_pickup_base
    - (fielder.stats.defence / 100) * PHYSICS_CONFIG.error_pickup_reduction
}

// ============================================================
// 거리 기반 히트 종류 결정
// ============================================================

function resolveHitType(
  range: number,
): Exclude<AtBatResult, 'in_progress' | 'strikeout' | 'walk' | 'hit_by_pitch' | 'home_run' | 'out'> {
  if (range < 45) return 'single'
  if (range < 70) {
    return Math.random() < 0.80 ? 'single' : 'double'
  }
  const r = Math.random()
  if (r < 0.30) return 'single'
  if (r < 0.90) return 'double'
  return 'triple'
}

// ============================================================
// M7: 타구 결과 판정
// 수비수 위치 + Defence 스탯 + 타구 물리 기반
// theta_h_override: 이미 생성된 방향각이 있으면 재사용
// ============================================================

export function resolveHitResult(
  exit_velocity: number,
  launch_angle:  number,
  batter:        Player,
  fielders:      Player[],
  theta_h_override?: number,
): HitResultDetail {
  // 1. 방향각 결정
  const theta_h = theta_h_override ?? selectDirectionAngle(batter)

  // 2. 타구 물리 계산
  const physics = calcBattedBallPhysics(exit_velocity, launch_angle, theta_h)

  // 3. 타구 종류 분류
  const ballType = classifyBallType(launch_angle)

  // 4. 홈런 판정 (수비수 배정 전에 체크)
  if (physics.range >= fenceDistance(theta_h)) {
    const { fielder, dist } = findResponsibleFielder(physics.landing, fielders)
    const fielder_pos = { x: physics.landing.field_x, y: physics.landing.field_y }
    const t_ball_travel = physics.t_bounce
    const fielder_approach_speed = 5.5 + (fielder.stats.defence / 100) * 1.5
    const t_fielding = t_ball_travel + dist / fielder_approach_speed + 0.3
    return { result: 'home_run', fielder, fielder_pos, t_fielding, t_ball_travel, is_infield: false, range: physics.range, ball_type: ballType, theta_h }
  }

  // ── 5. 땅볼: 경로 기반 인터셉트 모델 ──────────────────────
  if (ballType === 'grounder' && physics.grounder) {
    const intercept = findGrounderInterceptor(physics, exit_velocity, launch_angle, fielders)

    if (!intercept) {
      // 수비수 없음 → 안타
      const { fielder: fb, dist: fbDist } = findResponsibleFielder(physics.landing, fielders)
      return { result: 'single', fielder: fb, fielder_pos: { x: physics.landing.field_x, y: physics.landing.field_y }, t_fielding: 3.0, t_ball_travel: physics.t_bounce, is_infield: physics.range < 36, range: physics.range, ball_type: ballType, theta_h }
    }

    const p_out = calcGrounderCatchProb(intercept)
    const p_error = p_out * ERROR_COEFF
    const roll = Math.random()

    const fielder = intercept.fielder
    const fielder_pos = intercept.fielder_pos
    const t_ball_travel = physics.t_bounce
    const t_fielding = intercept.t_ball  // 공이 인터셉트 지점에 도달하는 시간
    const is_infield = intercept.intercept_dist < 36

    if (roll < p_out) {
      const catch_setup_time = intercept.margin > 0.5 ? 0.2 : 0.4
      return { result: 'out', fielder, fielder_pos, t_fielding, t_ball_travel, is_infield, range: physics.range, ball_type: ballType, theta_h, catch_setup_time }
    }
    if (roll < p_out + p_error) {
      const pickup_time = calcPickupTime(fielder)
      return { result: 'reach_on_error', fielder, fielder_pos, t_fielding: t_fielding + pickup_time, t_ball_travel, is_infield, range: physics.range, ball_type: ballType, theta_h, is_error: true }
    }

    // 안타
    const hitResult = resolveHitType(physics.range)
    return { result: hitResult, fielder, fielder_pos, t_fielding: t_fielding + 1.5, t_ball_travel, is_infield, range: physics.range, ball_type: ballType, theta_h }
  }

  // ── 6. 뜬공/라인드라이브: 기존 착지점 기반 모델 ───────────
  const { fielder, dist } = findResponsibleFielder(physics.landing, fielders)
  const fielder_pos   = { x: physics.landing.field_x, y: physics.landing.field_y }
  const t_ball_travel = physics.t_bounce
  const fielder_approach_speed = 5.5 + (fielder.stats.defence / 100) * 1.5
  const t_approach    = dist / fielder_approach_speed
  const t_fielding    = t_ball_travel + t_approach + 0.3
  const is_infield    = physics.range < 36

  const p_out = calcCatchProbability(ballType, dist, physics.v_roll_0, physics.t_bounce, fielder)
  const p_error = p_out * ERROR_COEFF
  const roll    = Math.random()

  if (roll < p_out) {
    const catch_setup_time = p_out >= 0.5 ? 0.2 : 0.4
    return { result: 'out', fielder, fielder_pos, t_fielding, t_ball_travel, is_infield, range: physics.range, ball_type: ballType, theta_h, catch_setup_time }
  }
  if (roll < p_out + p_error) {
    const pickup_time = calcPickupTime(fielder)
    return { result: 'reach_on_error', fielder, fielder_pos, t_fielding: t_fielding + pickup_time, t_ball_travel, is_infield, range: physics.range, ball_type: ballType, theta_h, is_error: true }
  }

  const result = resolveHitType(physics.range)
  const hit_t_fielding = is_infield ? t_fielding + 3.0 : t_fielding
  return { result, fielder, fielder_pos, t_fielding: hit_t_fielding, t_ball_travel, is_infield, range: physics.range, ball_type: ballType, theta_h }
}

// ============================================================
// 파울 영역 포구 판정
// 뜬공만 대상 — 땅볼은 그냥 파울
// ============================================================

export function resolveFoulCatchable(
  exit_velocity: number,
  launch_angle:  number,
  theta_h:       number,
  fielders:      Player[],
): { caught: boolean; isError: boolean; fielder?: Player; hitDetail?: HitResultDetail } {
  const ballType = classifyBallType(launch_angle)

  // 땅볼은 파울 영역에서 포구 불가 → 순수 파울
  if (ballType === 'grounder') {
    return { caught: false, isError: false }
  }

  // 물리 계산
  const physics = calcBattedBallPhysics(exit_velocity, launch_angle, theta_h)
  const { fielder, dist } = findResponsibleFielder(physics.landing, fielders)

  // 수비수가 바운드 전에 도달 가능한지 판정
  const { outfielder_speed_min, outfielder_speed_max } = PHYSICS_CONFIG
  const fielder_speed = outfielder_speed_min + (fielder.stats.defence / 100) * (outfielder_speed_max - outfielder_speed_min)
  const reachable_dist = fielder_speed * physics.t_bounce

  if (dist > reachable_dist) {
    // 도달 불가 → 순수 파울
    return { caught: false, isError: false }
  }

  // 포구 시도 — 에러 확률 (파울 지역은 기본 에러율의 2배)
  const error_chance = ERROR_COEFF * 2 * (1 - fielder.stats.defence / 200)
  if (Math.random() < error_chance) {
    // 파울 플라이 에러 → 파울 처리 + 오버레이
    return { caught: true, isError: true, fielder }
  }

  // 포구 성공 → 파울 아웃
  const fielder_pos = { x: physics.landing.field_x, y: physics.landing.field_y }
  const t_approach = dist / fielder_speed
  const hitDetail: HitResultDetail = {
    result:           'out',
    fielder,
    fielder_pos,
    t_fielding:       physics.t_bounce + t_approach + 0.3,
    t_ball_travel:    physics.t_bounce,
    is_infield:       physics.range < 36,
    range:            physics.range,
    ball_type:        ballType,
    theta_h,
    catch_setup_time: 0.4,
  }
  return { caught: true, isError: false, hitDetail }
}
