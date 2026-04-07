import type { Player } from '../types/player'
import type { ZoneType } from '../engine/types'
import type { FieldCoords, BallPhysicsResult, BallType } from './types'
import { PHYSICS_CONFIG } from './config'
import { CONTACT_CONFIG } from '../batting/config'

// ============================================================
// 타구 물리 모델
// Phase A: drag 방정식 (D값 구간 보정 + Magnus carry_factor)
// Phase B: 첫 바운드 후 지면 구르기 (v_roll_0 산출)
// ============================================================

const G           = 9.8    // 중력 가속도 (m/s²)
const RESTITUTION = 0.5    // 잔디 기준 탄성 계수

// drag 계수 — EV 속도 구간별 보정 (2차 항력 선형 근사)
function getD(ev_kmh: number): number {
  if (ev_kmh <= 120) return 0.18
  if (ev_kmh <= 150) return 0.22
  return 0.27
}

// ── 타구 종류 분류 ────────────────────────────────────────

export function classifyBallType(la_deg: number): BallType {
  if (la_deg <= 10)  return 'grounder'
  if (la_deg <= 25)  return 'line_drive'
  if (la_deg <= 45)  return 'fly'
  return 'popup'
}

// ── 파울 영역 분류 ────────────────────────────────────────

export type TerritoryZone = 'fair' | 'foul_catchable' | 'foul_uncatchable'

export function classifyTerritory(theta_deg: number): TerritoryZone {
  const abs = Math.abs(theta_deg)
  if (abs <= PHYSICS_CONFIG.FAIR_ANGLE) return 'fair'
  if (abs <= PHYSICS_CONFIG.STANDS_ANGLE) return 'foul_catchable'
  return 'foul_uncatchable'
}

// ── 방향각 선택 ────────────────────���──────────────────────

/**
 * 타자의 당기기 편향 + 정규분포 노이즈로 방향각 결정.
 * zoneType이 주어지면 fair_prob에 따라 페어/파울 분기:
 *   - 페어 → ±45° 이내 (truncated Gaussian)
 *   - 파울 → 45°~70° (좌우 균등)
 * zoneType이 없으면 기존 방식(±42°, 항상 페어).
 */
export function selectDirectionAngle(batter: Player, zoneType?: ZoneType): number {
  const mu = batter.bats === 'L' ? 5 : -5

  if (zoneType) {
    const pFair = CONTACT_CONFIG.fair_prob[zoneType]

    if (Math.random() < pFair) {
      // 페어 영역: truncated Gaussian (±45° 이내)
      for (;;) {
        const u1 = Math.random()
        const u2 = Math.random()
        const noise = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2) * 25
        const theta = mu + noise
        if (Math.abs(theta) <= PHYSICS_CONFIG.FAIR_ANGLE) return theta
      }
    } else {
      // 파울 영역: 45°~180° — 지수 감소 분포
      // 파울 라인 근처(45~60°)가 가장 빈번, 뒤로 갈수록 급감
      // 지수 분포: θ = 45 + exponential(λ), λ=0.012
      // 수비 가능(45~60°) ≈ 파울의 17%, 관중석/백네트 ≈ 83%
      const side = Math.random() < 0.5 ? 1 : -1
      const lambda = 0.012
      const raw = -Math.log(1 - Math.random() + 1e-10) / lambda
      const foulAngle = PHYSICS_CONFIG.FAIR_ANGLE + Math.min(raw, 135) // 45° + 0~135° = 45°~180°
      return side * foulAngle
    }
  }

  // fallback: zoneType 미제공 시 기존 동작 (항상 페어)
  const u1 = Math.random()
  const u2 = Math.random()
  const noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * 25
  const theta = mu + noise
  return Math.max(-42, Math.min(42, theta))
}

// ── 착지 좌표 변환 ────────────────────────────────────────

export function toFieldCoords(range: number, theta_deg: number): FieldCoords {
  const theta = theta_deg * (Math.PI / 180)
  return {
    field_x: range * Math.sin(theta),
    field_y: range * Math.cos(theta),
  }
}

// ── 타구 물리 계산 (메인) ─────────────────────────────────

/**
 * EV + LA + 방향각 → 착지 좌표, 첫 바운드 속도
 */
export function calcBattedBallPhysics(
  ev_kmh:    number,
  la_deg:    number,
  theta_deg: number,
): BallPhysicsResult {
  const v0 = ev_kmh / 3.6               // m/s
  const theta = la_deg * (Math.PI / 180)
  const D = getD(ev_kmh)

  const vx0 = v0 * Math.cos(theta)
  const vy0 = v0 * Math.sin(theta)

  // drag 방정식
  // x(t) = (vx0 / D) × (1 − e^(−Dt))
  // y(t) = (−G×t / D) + ((D×vy0 + G) / D²) × (1 − e^(−Dt))
  const xAt = (t: number) => (vx0 / D) * (1 - Math.exp(-D * t))
  const yAt = (t: number) =>
    (-G * t / D) + ((D * vy0 + G) / (D * D)) * (1 - Math.exp(-D * t))

  // y(t) = 0 이진 탐색 → t_bounce
  // popup/grounder 예외: la ≤ 0 이면 즉시 t=0.01s
  let t_bounce = 0.01
  if (la_deg > 0) {
    let lo = 0, hi = 20
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      if (yAt(mid) > 0) lo = mid
      else               hi = mid
      if (hi - lo < 0.001) break
    }
    t_bounce = (lo + hi) / 2
  }

  const range_raw = xAt(t_bounce)

  // 첫 바운드 수평 속도 (drag 감속 후)
  const vx_bounce = vx0 * Math.exp(-D * t_bounce)
  const v_roll_0  = vx_bounce * RESTITUTION

  // Magnus carry_factor (백스핀 양력 근사 — 공중 타구 전용)
  const contact_quality = Math.max(0, Math.min(1, (ev_kmh - 120) / 50))
  const carry_factor    = 1.0 + contact_quality * PHYSICS_CONFIG.carry_factor_max

  // Phase B: 구르기 거리 (grounder 전용)
  // 첫 바운드 후 잔디 마찰로 감속하며 구르는 거리
  // mu_roll = 0.85 (야구공 잔디 위 유효 구르기 마찰 계수)
  const MU_ROLL   = 0.85
  const roll_dist = la_deg <= 10
    ? (v_roll_0 * v_roll_0) / (2 * MU_ROLL * G)
    : 0

  // grounder: carry_factor 미적용 (지면 구르기), 구르기 거리 추가
  // fly/line_drive: carry_factor 적용, 구르기 없음
  const range = la_deg <= 10
    ? range_raw + roll_dist
    : range_raw * carry_factor

  // 땅볼 경로 데이터
  const isGrounder = la_deg <= 10
  const theta_rad = theta_deg * (Math.PI / 180)
  const grounder = isGrounder ? {
    bounce_dist: range_raw,
    mu_roll:     MU_ROLL,
    dir:         { dx: Math.sin(theta_rad), dy: Math.cos(theta_rad) },
  } : undefined

  return {
    range,
    v_roll_0,
    t_bounce,
    landing: toFieldCoords(range, theta_deg),
    grounder,
  }
}

// ── 땅볼 경로 시간 계산 ──────────────────────────────────

/**
 * 땅볼이 홈에서 dist(m) 지점에 도달하는 시간을 반환.
 * 도달 불가능(공이 그 전에 멈춤)이면 Infinity.
 *
 * Phase A (공중): d_air(t) = (vx0/D)(1 - e^(-Dt)), t ∈ [0, t_bounce]
 * Phase B (구르기): d_roll(t) = bounce_dist + v_roll*t' - ½μgt'²
 */
export function grounderTimeAtDist(
  dist:       number,
  physics:    BallPhysicsResult,
  ev_kmh:     number,
  la_deg:     number,
): number {
  if (!physics.grounder) return Infinity

  const { bounce_dist, mu_roll } = physics.grounder
  const v0 = ev_kmh / 3.6
  const theta = la_deg * (Math.PI / 180)
  const vx0 = v0 * Math.cos(theta)
  const D = getD(ev_kmh)

  // Phase A: 공중 단계 (바운드 전)
  if (dist <= bounce_dist) {
    // d_air(t) = (vx0/D)(1 - e^(-Dt)) = dist
    // 1 - e^(-Dt) = dist * D / vx0
    const ratio = dist * D / vx0
    if (ratio >= 1) return physics.t_bounce // 거의 바운드 지점
    return -Math.log(1 - ratio) / D
  }

  // Phase B: 구르기 단계
  // d(t') = bounce_dist + v_roll_0 * t' - 0.5 * mu * g * t'^2 = dist
  // 0.5*mu*g*t'^2 - v_roll_0*t' + (dist - bounce_dist) = 0
  const a = 0.5 * mu_roll * G
  const b = -physics.v_roll_0
  const c = dist - bounce_dist
  const discriminant = b * b - 4 * a * c

  if (discriminant < 0) return Infinity // 도달 불가 (공이 먼저 멈춤)

  const t_roll = (-b - Math.sqrt(discriminant)) / (2 * a)
  if (t_roll < 0) return Infinity

  return physics.t_bounce + t_roll
}
