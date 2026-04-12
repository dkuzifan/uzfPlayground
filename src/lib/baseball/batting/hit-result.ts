import type { Player }         from '../types/player'
import type { AtBatResult }    from './types'
import type { HitResultDetail } from '../defence/types'
import {
  calcBattedBallPhysics,
  classifyBallType,
  ballHeightAtDist,
  toFieldCoords,
} from '../defence/ball-physics'
import {
  findResponsibleFielder,
  calcCatchProbability,
  findGrounderInterceptor,
  calcGrounderCatchProb,
  calcCatch4Zone,
} from '../defence/catch-probability'
import { ERROR_COEFF } from '../game/config'
import { PHYSICS_CONFIG } from '../defence/config'
import {
  euclidDist,
  BASE_POS,
  maxDirectDist,
  type Vec2,
} from '../defence/throw-judge'

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
  fence_cf      = 126,
  fence_corner  = 100,
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
// sigmoid — 확률 변환 유틸
// ============================================================

function sigmoid(x: number, scale: number): number {
  return 1 / (1 + Math.exp(-x / scale))
}

// ============================================================
// 타이밍 기반 히트 종류 결정
//
// 수비수가 공을 줍고 베이스로 송구하는 시간 vs
// 타자 주자가 각 루에 도달하는 시간을 비교해 히트 종류 결정.
// ============================================================

function resolveHitTypeByTiming(
  batter:     Player,
  fielder:    Player,
  range:      number,
  theta_h:    number,
  t_fielding: number,     // 공 줍기까지 시간 (+1.5 through-ball 포함)
  is_infield: boolean,
): 'single' | 'double' | 'triple' {
  // 내야 관통 → 무조건 단타 (외야까지 깊이 안 감)
  if (is_infield) return 'single'

  // ── 공 위치 추정 (range + 방향각 기반) ──────────────────
  const theta_rad = theta_h * Math.PI / 180
  const pickup: Vec2 = {
    x: range * Math.sin(theta_rad),
    y: range * Math.cos(theta_rad),
  }

  // ── 타자 주자 속도 ─────────────────────────────────────
  const batter_speed = 5.0 + (batter.stats.running / 100) * 3.0  // 5.0~8.0 m/s

  // ── 수비수 송구 속도 ───────────────────────────────────
  const throw_speed = (80 + fielder.stats.throw * 0.7) / 3.6  // m/s

  // ── 수비 시간 구성 ─────────────────────────────────────
  // deep_chase: 깊은 타구(70m+) — 공이 벽/코너로 굴러가며 추가 추격 시간
  const deep_chase = Math.max(0, (range - 70) * 0.05)
  // setup_time: 공 줍고 → 돌아서서 → 송구 준비 (체제 전환)
  const setup_time = 1.0
  const t_ready = t_fielding + deep_chase + setup_time

  // ── 중계 판단용 최대 직접 송구 거리 ─────────────────────
  const max_direct = maxDirectDist(fielder.stats.throw)

  function throwTimeToBase(target: Vec2): number {
    const dist = euclidDist(pickup, target)
    const relay_overhead = dist > max_direct ? 1.0 : 0
    return dist / throw_speed + relay_overhead
  }

  const catch_handle = 0.3  // 포구 후 태그 준비 시간

  // ── 3루타 체크 (홈→1B→2B→3B = 82.29m) ─────────────────
  // 매우 보수적: 주루 코치가 확실할 때만 돌림 (3.5s 안전 마진)
  const t_batter_3B = 82.29 / batter_speed
  const t_def_3B = t_ready + throwTimeToBase(BASE_POS['3B']) + catch_handle
  const margin_3B = t_def_3B - t_batter_3B

  if (margin_3B > 3.5) {
    if (Math.random() < sigmoid(margin_3B - 3.5, 0.6)) return 'triple'
  }

  // ── 2루타 체크 (홈→1B→2B = 54.86m) ────────────────────
  const t_batter_2B = 54.86 / batter_speed
  const t_def_2B = t_ready + throwTimeToBase(BASE_POS['2B']) + catch_handle
  const margin_2B = t_def_2B - t_batter_2B

  if (margin_2B > 0) {
    if (Math.random() < sigmoid(margin_2B, 0.8)) return 'double'
  }

  return 'single'
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
  theta_h:       number,
): HitResultDetail {

  // 2. 타구 물리 계산
  const physics = calcBattedBallPhysics(exit_velocity, launch_angle, theta_h)

  // 3. 타구 종류 분류
  const ballType = classifyBallType(launch_angle)

  // 4. 홈런 / 펜스 바운드 판정
  const fence_dist = fenceDistance(theta_h)
  if (physics.range >= fence_dist) {
    // carry_factor 역산: 원시 궤적 기준 펜스 지점 높이를 계산
    const contact_quality = Math.max(0, Math.min(1, (exit_velocity - 120) / 50))
    const carry_factor = launch_angle <= 10
      ? 1.0
      : 1.0 + contact_quality * PHYSICS_CONFIG.carry_factor_max
    const raw_dist = fence_dist / carry_factor
    const h_at_fence = ballHeightAtDist(raw_dist, exit_velocity, launch_angle)

    if (h_at_fence > PHYSICS_CONFIG.FENCE_HEIGHT) {
      // ── 클리어 홈런: 펜스 위를 넘김 ───────────────────
      const { fielder, dist } = findResponsibleFielder(physics.landing, fielders)
      const fielder_pos = { x: physics.landing.field_x, y: physics.landing.field_y }
      const t_ball_travel = physics.t_bounce
      const fielder_approach_speed = 5.5 + (fielder.stats.defence / 100) * 1.5
      const t_fielding = t_ball_travel + dist / fielder_approach_speed + 0.3
      return { result: 'home_run', fielder, fielder_pos, t_fielding, t_ball_travel, is_infield: false, range: physics.range, ball_type: ballType, theta_h }
    }

    // ── 펜스 바운드: 공이 담장에 맞고 튕겨나옴 ──────────
    // 공은 펜스 앞 ~3m에 떨어짐, 외야수가 회수
    const bounce_range = fence_dist - 3
    const bounce_landing = toFieldCoords(bounce_range, theta_h)
    const { fielder: fb, dist: fb_dist } = findResponsibleFielder(bounce_landing, fielders)
    const { outfielder_speed_min, outfielder_speed_max } = PHYSICS_CONFIG
    const fb_speed = outfielder_speed_min + (fb.stats.defence / 100) * (outfielder_speed_max - outfielder_speed_min)
    const t_approach = fb_dist / fb_speed + 0.3
    const wall_bounce_delay = 0.8  // 벽 바운드 리액션 + 공 잡기
    const t_fb = physics.t_bounce + t_approach + wall_bounce_delay
    const fb_pos = { x: bounce_landing.field_x, y: bounce_landing.field_y }

    const hitResult = resolveHitTypeByTiming(batter, fb, bounce_range, theta_h, t_fb, false)
    return { result: hitResult, fielder: fb, fielder_pos: fb_pos, t_fielding: t_fb, t_ball_travel: physics.t_bounce, is_infield: false, range: bounce_range, ball_type: ballType, theta_h }
  }

  // ── 5. 땅볼: 경로 기반 인터셉트 + 4구간 모델 ──────────────
  if (ballType === 'grounder' && physics.grounder) {
    const intercept = findGrounderInterceptor(physics, exit_velocity, launch_angle, fielders)

    if (!intercept) {
      const { fielder: fb } = findResponsibleFielder(physics.landing, fielders)
      return { result: 'single', fielder: fb, fielder_pos: { x: physics.landing.field_x, y: physics.landing.field_y }, t_fielding: 3.0, t_ball_travel: physics.t_bounce, is_infield: physics.range < 36, range: physics.range, ball_type: ballType, theta_h }
    }

    const catchResult = calcGrounderCatchProb(intercept, exit_velocity, launch_angle)
    const roll = Math.random()

    const fielder = intercept.fielder
    const fielder_pos = intercept.fielder_pos
    const t_ball_travel = physics.t_bounce
    const t_fielding = intercept.t_ball + catchResult.t_delay  // 마진 기반 송구 지연 포함
    const is_infield = intercept.intercept_dist < 36

    if (roll < catchResult.p_out) {
      const catch_setup_time = intercept.margin > 0.5 ? 0.2 : 0.4
      return { result: 'out', fielder, fielder_pos, t_fielding, t_ball_travel, is_infield, range: physics.range, ball_type: ballType, theta_h, catch_setup_time }
    }
    if (roll < catchResult.p_out + catchResult.p_error) {
      const pickup_time = calcPickupTime(fielder)
      return { result: 'reach_on_error', fielder, fielder_pos, t_fielding: t_fielding + pickup_time, t_ball_travel, is_infield, range: physics.range, ball_type: ballType, theta_h, is_error: true }
    }

    const t_through = t_fielding + 1.5
    const hitResult = resolveHitTypeByTiming(batter, fielder, physics.range, theta_h, t_through, is_infield)
    return { result: hitResult, fielder, fielder_pos, t_fielding: t_through, t_ball_travel, is_infield, range: physics.range, ball_type: ballType, theta_h }
  }

  // ── 6. 뜬공/라인드라이브: 4구간 시간 기반 모델 ─────────────
  const { fielder, dist } = findResponsibleFielder(physics.landing, fielders)
  const fielder_pos   = { x: physics.landing.field_x, y: physics.landing.field_y }
  const t_ball_travel = physics.t_bounce
  const is_infield    = physics.range < 36

  // 시간 기반 마진 계산 (뜬공)
  const { outfielder_speed_min, outfielder_speed_max } = PHYSICS_CONFIG
  const fielder_speed = outfielder_speed_min + (fielder.stats.defence / 100) * (outfielder_speed_max - outfielder_speed_min)
  const t_fielder_move = dist / fielder_speed + 0.30
  const fly_margin = t_ball_travel - t_fielder_move

  const catchResult = calcCatch4Zone(fly_margin, fielder.stats.defence, fielder.stats.throw, 0, 0)
  const t_fielding = t_ball_travel + catchResult.t_delay + 0.3
  const roll = Math.random()

  if (roll < catchResult.p_out) {
    const catch_setup_time = fly_margin > 0.5 ? 0.2 : 0.4
    return { result: 'out', fielder, fielder_pos, t_fielding, t_ball_travel, is_infield, range: physics.range, ball_type: ballType, theta_h, catch_setup_time }
  }
  if (roll < catchResult.p_out + catchResult.p_error) {
    const pickup_time = calcPickupTime(fielder)
    return { result: 'reach_on_error', fielder, fielder_pos, t_fielding: t_fielding + pickup_time, t_ball_travel, is_infield, range: physics.range, ball_type: ballType, theta_h, is_error: true }
  }

  const t_through = t_fielding + 1.5
  const result = resolveHitTypeByTiming(batter, fielder, physics.range, theta_h, t_through, is_infield)
  return { result, fielder, fielder_pos, t_fielding: t_through, t_ball_travel, is_infield, range: physics.range, ball_type: ballType, theta_h }
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
