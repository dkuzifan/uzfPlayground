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

// ============================================================
// CatchResult — 통합 포구 결과 (4구간 모델)
// ============================================================

export interface CatchResult {
  p_out:        number   // 아웃 확률
  p_error:      number   // 실책 출루 확률
  t_delay:      number   // 마진에 따른 송구 추가 지연 (초)
}

/**
 * 4구간 통합 포구 판정.
 * 땅볼·뜬공 공통 — margin(시간)과 수비수 스탯으로 결과 계산.
 *
 * 구간 1: margin > T (여유) — 포구 확정, 기본 에러율, 지연 없음
 * 구간 2: 0 < margin ≤ T (빠듯) — 포구 확정, 에러↑, 송구 지연
 * 구간 3: -L < margin ≤ 0 (반응/다이빙) — Defence 기반 포구 확률, 에러 없음, 큰 지연
 * 구간 4: margin ≤ -L (불가) — 안타
 */
export function calcCatch4Zone(
  margin:       number,
  defence:      number,
  throwStat:    number,
  ev_kmh:       number,
  perp_dist:    number,   // 수직 이동 거리 (땅볼용, 뜬공은 0 전달)
): CatchResult {
  const T = PHYSICS_CONFIG.CATCH_CLEAN_THRESHOLD
  const L = PHYSICS_CONFIG.CATCH_SNAG_LIMIT

  // ── 구간 4: 불가 ──────────────────────────────────────
  if (margin <= -L) {
    return { p_out: 0, p_error: 0, t_delay: 0 }
  }

  // ── 구간 3: 반응/다이빙 캐치 ──────────────────────────
  if (margin <= 0) {
    // 포구 확률: Defence 기반 × 남은 여지
    const remaining = 1 - Math.abs(margin) / L  // 1(margin=0) → 0(margin=-L)
    const defence_factor = 0.2 + (defence / 100) * 0.6  // Defence 0→20%, 100→80%
    const p_catch = remaining * defence_factor

    // 지연: 다이빙/뻗어서 잡은 후 회복
    const base_delay = 0.8 + Math.abs(margin) * 2.0
    const t_delay = Math.max(0.3, base_delay - (defence / 100) * 0.25 - (throwStat / 100) * 0.10)

    return { p_out: clamp(p_catch, 0, 0.80), p_error: 0, t_delay }
  }

  // ── 기본 에러율 (구간 1, 2 공통) ──────────────────────
  const base_error = 0.002 + (1 - defence / 100) * 0.035  // 0.2% ~ 3.7% (MLB 인플레이 에러율 ~1.5% 역산)
  // 난이도 보정: 이동 거리 + 타구 속도
  const movement_diff = perp_dist > 2 ? 0.015 * (perp_dist - 2) : 0
  const speed_diff = ev_kmh > 130 ? 0.01 * ((ev_kmh - 130) / 10) : 0

  // ── 구간 2: 빠듯한 도달 ───────────────────────────────
  if (margin <= T) {
    const tightness = 1 - margin / T  // 0(여유) → 1(간신히)
    const margin_error = 0.03 * tightness  // 간신히 도달 시 +3%
    const p_error = Math.min(0.25, base_error + margin_error + movement_diff + speed_diff)

    // 지연: 급박할수록 송구 느림
    const base_delay = 0.3 * tightness
    const t_delay = Math.max(0, base_delay - (defence / 100) * 0.10 - (throwStat / 100) * 0.05)

    return { p_out: clamp(1 - p_error, 0.02, 0.99), p_error, t_delay }
  }

  // ── 구간 1: 여유 도달 ─────────────────────────────────
  const p_error = Math.min(0.20, base_error + movement_diff + speed_diff)
  return { p_out: clamp(1 - p_error, 0.02, 0.99), p_error, t_delay: 0 }
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

  // 플라이 / 라인드라이브 — 4구간 시간 기반 모델
  if (ballType === 'fly' || ballType === 'line_drive') {
    const { outfielder_speed_min, outfielder_speed_max } = PHYSICS_CONFIG
    const fielder_speed = outfielder_speed_min + (defence / 100) * (outfielder_speed_max - outfielder_speed_min)
    const t_fielder_move = d / fielder_speed + 0.30  // 반응 시간 포함
    const margin = t_bounce - t_fielder_move

    const result = calcCatch4Zone(margin, defence, fielder.stats.throw, 0, 0)
    return result.p_out  // 기존 인터페이스 호환 (number 반환)
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
 * 땅볼 인터셉트 포구 — 4구간 통합 모델.
 * CatchResult를 반환하여 hit-result.ts에서 에러 이중 계산 방지.
 */
export function calcGrounderCatchProb(
  intercept: GrounderInterceptResult,
  ev_kmh:    number,
  la_deg:    number,
): CatchResult {
  const { margin, perp_dist, fielder } = intercept
  return calcCatch4Zone(margin, fielder.stats.defence, fielder.stats.throw, ev_kmh, perp_dist)
}
