import type { Player } from '../types/player'
import type { FieldCoords, BallType, BallPhysicsResult } from './types'
import { FIELDER_DEFAULT_POS } from './fielder-positions'
import { PHYSICS_CONFIG } from './config'
import { grounderTimeAtDist } from './ball-physics'

function euclideanDist(a: FieldCoords, b: { x: number; y: number }): number {
  const dx = a.field_x - b.x
  const dy = a.field_y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// ── 담당 수비수 선택 ──────────────────────────────────────

/**
 * 착지 좌표에서 가장 가까운 수비수를 담당으로 반환.
 * Player.defence_pos → FIELDER_DEFAULT_POS[position_1] 순으로 폴백.
 * 적절한 수비수가 없으면 console.warn + 더미 플레이어(Defence 70) 반환.
 */
export function findResponsibleFielder(
  landing:  FieldCoords,
  fielders: Player[],
): { fielder: Player; pos: { x: number; y: number }; dist: number } {
  let best: { fielder: Player; pos: { x: number; y: number }; dist: number } | null = null

  for (const f of fielders) {
    const pos = f.defence_pos ?? FIELDER_DEFAULT_POS[f.position_1]
    if (!pos) continue

    const d = euclideanDist(landing, pos)
    if (!best || d < best.dist) {
      best = { fielder: f, pos, dist: d }
    }
  }

  if (!best) {
    console.warn('[수비 엔진] findResponsibleFielder: 담당 수비수를 찾을 수 없음. 기본값 사용.')
    const dummy: Player = {
      id: 'dummy', team_id: '', name: 'Unknown', number: 0, age: 0,
      bats: 'R', throws: 'R', position_1: 'CF', position_2: null, position_3: null,
      stats: {
        ball_power: 0, ball_control: 0, ball_break: 0, ball_speed: 0,
        contact: 70, power: 70, defence: 70, throw: 70, running: 70, stamina: 70,
      },
      pitch_types: [], zone_bottom: 0.5, zone_top: 1.1, portrait_url: null,
    }
    return { fielder: dummy, pos: { x: landing.field_x, y: landing.field_y }, dist: 0 }
  }

  return best
}

// ── 포구 확률 계산 ────────────────────────────────────────

/**
 * 타구 종류 × 수비수-착지 거리 × Defence 스탯 → 아웃 확률
 *
 * fly / line_drive — 체공 시간 기반 (B 모델)
 *   수비수가 t_bounce 동안 이동 가능한 거리(reachable_dist)와
 *   실제 거리(d)를 비교해 포구 가능 여부 결정.
 *   라인드라이브는 t_bounce가 짧아 자연스럽게 P_out이 낮아짐.
 *
 * grounder — Phase B 지수 감속 도달 시간 기반
 *   공이 수비수 위치에 도달하는 시간 vs 수비수 반응+이동 시간 비교.
 */
export function calcCatchProbability(
  ballType: BallType,
  d:        number,
  v_roll_0: number,
  t_bounce: number,
  fielder:  Player,
): number {
  const defence = fielder.stats.defence

  // 팝업: 항상 아웃
  if (ballType === 'popup') return 1.0

  // 플라이 / 라인드라이브 — 체공 시간 기반
  if (ballType === 'fly' || ballType === 'line_drive') {
    const { outfielder_speed_min, outfielder_speed_max } = PHYSICS_CONFIG
    const fielder_speed   = outfielder_speed_min + (defence / 100) * (outfielder_speed_max - outfielder_speed_min)
    const reachable_dist  = fielder_speed * t_bounce
    const excess          = Math.max(d - reachable_dist, 0)
    // 포구 확률 상한: 0.80 (이전 0.87 — 땅볼 수비 모델 보정 후 전체 BABIP 재캘리브레이션)
    // 1m 초과당 −0.10
    return clamp(0.80 - 0.10 * excess, 0.05, 0.80)
  }

  // 내야 땅볼 — 거리·속도 기반 범위 모델 (fallback: 경로 데이터 없을 때)
  const fielder_speed_g = 4.0 + (defence / 100) * 2.0  // 4.0–6.0 m/s
  const reachable_dist  = fielder_speed_g * 1.8
  const speed_penalty   = Math.min(0.18, v_roll_0 / 20 * 0.18)
  const excess          = Math.max(0, d - reachable_dist)
  return clamp(0.90 - 0.10 * excess - speed_penalty, 0.05, 0.90)
}

// ============================================================
// 땅볼 경로 기반 인터셉트 시스템
// ============================================================

export interface GrounderInterceptResult {
  fielder:         Player
  fielder_pos:     { x: number; y: number }
  perp_dist:       number    // 수비수→경로 수직 거리 (m)
  intercept_dist:  number    // 홈→인터셉트 지점 거리 (m)
  t_ball:          number    // 공이 인터셉트 지점 도달 시간 (s)
  t_fielder:       number    // 수비수가 인터셉트 지점 도달 시간 (s)
  margin:          number    // t_ball - t_fielder (양수=수비 여유, 음수=못잡음)
  can_intercept:   boolean
}

/**
 * 땅볼 경로에 대해 각 수비수의 인터셉트 가능성을 계산하고,
 * 가장 빨리 인터셉트 가능한 수비수를 반환.
 */
export function findGrounderInterceptor(
  physics:    BallPhysicsResult,
  ev_kmh:     number,
  la_deg:     number,
  fielders:   Player[],
): GrounderInterceptResult | null {
  if (!physics.grounder) return null

  const { dir } = physics.grounder

  // 포지션별 반응 시간 (s)
  // P: 팔로스루 → 수비 전환 필요, C: 웅크린 자세에서 기립
  // 내야수: 레디 자세, 외야수: 먼 거리 판단 시간
  const REACTION_BY_POS: Record<string, number> = {
    P: 0.45, C: 0.35,
    '1B': 0.25, '2B': 0.25, SS: 0.25, '3B': 0.25,
    LF: 0.30, CF: 0.30, RF: 0.30,
  }

  // 공이 멈추는 시간 (t_stop) 및 최종 좌표
  const t_roll_stop = physics.v_roll_0 / (physics.grounder!.mu_roll * 9.8)
  const t_stop = physics.t_bounce + t_roll_stop
  const stop_x = physics.range * dir.dx
  const stop_y = physics.range * dir.dy

  let best: GrounderInterceptResult | null = null

  for (const f of fielders) {
    const pos = f.defence_pos ?? FIELDER_DEFAULT_POS[f.position_1]
    if (!pos) continue

    const proj = pos.x * dir.dx + pos.y * dir.dy
    const perp = Math.abs(pos.x * dir.dy - pos.y * dir.dx)

    if (proj < 5) continue

    const fielder_speed = 4.0 + (f.stats.defence / 100) * 2.0
    const reaction = REACTION_BY_POS[f.position_1] ?? 0.25

    let t_ball: number
    let t_fielder: number
    let intercept_dist: number
    let actual_perp: number

    if (proj <= physics.range) {
      // Case A: 공이 수비수 투영 지점을 지나감 → 경로 위에서 인터셉트
      t_ball = grounderTimeAtDist(proj, physics, ev_kmh, la_deg)
      t_fielder = reaction + perp / fielder_speed
      intercept_dist = proj
      actual_perp = perp
    } else {
      // Case B: 공이 수비수 투영 지점 전에 멈춤 → 수비수가 멈춘 공까지 달려감
      t_ball = t_stop  // 공이 멈추는 시간 (공은 이미 정지 상태)
      const dx_stop = pos.x - stop_x
      const dy_stop = pos.y - stop_y
      const dist_to_stop = Math.sqrt(dx_stop * dx_stop + dy_stop * dy_stop)
      t_fielder = reaction + dist_to_stop / fielder_speed
      intercept_dist = physics.range
      actual_perp = dist_to_stop
    }

    const margin = t_ball - t_fielder
    const can_intercept = margin >= 0

    const candidate: GrounderInterceptResult = {
      fielder: f,
      fielder_pos: pos,
      perp_dist: actual_perp,
      intercept_dist,
      t_ball,
      t_fielder,
      margin,
      can_intercept,
    }

    if (!best || margin > best.margin) {
      best = candidate
    }
  }

  return best
}

/**
 * 인터셉트 마진으로 포구 확률 계산.
 * margin > 0: 여유 있는 포구 → 확률 높음
 * margin < 0: 늦음 → 확률 낮음 (안타)
 * margin ≈ 0: 아슬아슬 → 50/50
 */
export function calcGrounderCatchProb(
  intercept: GrounderInterceptResult,
  ev_kmh:    number,
  la_deg:    number,
): number {
  const { margin, perp_dist, intercept_dist } = intercept

  let base: number

  if (margin >= 0) {
    // 수비수가 먼저 도착 → 시간 여유 기반
    // scale=0.15 → 0.15초 이상 여유면 거의 확실
    base = 1 / (1 + Math.exp(-margin / 0.15))
  } else {
    // 공이 먼저 통과 → 물리적 거리(overshoot) 기반
    // margin < 0일 때 공이 인터셉트 지점을 얼마나 지나갔는지
    const ball_speed = ev_kmh / 3.6  // 대략적 공 속도 (감속 미반영, 보수적)
    const overshoot = ball_speed * Math.abs(margin)  // 지나간 거리 (m)
    // 0.3m 이내: 반사적 포구 가능 (~30%), 1m 이상: 불가능
    base = Math.exp(-overshoot * 3)  // 0.3m→41%, 0.5m→22%, 1m→5%, 2m→0.2%
  }

  // 수직 거리 보정: 3m 이상이면 다이빙 캐치 영역
  const perp_penalty = perp_dist > 3 ? 0.10 * (perp_dist - 3) : 0

  return clamp(base - perp_penalty, 0.02, 0.95)
}
