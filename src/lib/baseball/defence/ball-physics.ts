import type { Player } from '../types/player'
import type { FieldCoords, BallPhysicsResult, BallType } from './types'
import { PHYSICS_CONFIG } from './config'

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

// ── 방향각 선택 ───────────────────────────────────────────

/**
 * 타자의 당기기 편향 + 정규분포 노이즈로 방향각 결정
 * 0° = 중견수, 양수 = 우측(1루 방향), 음수 = 좌측(3루 방향)
 */
export function selectDirectionAngle(batter: Player): number {
  // 우타자: 당기기 = 좌측(−5°), 좌타자: 당기기 = 우측(+5°), 스위치: 우타 기준
  const mu = batter.bats === 'L' ? 5 : -5

  // Box-Muller 정규분포 (σ = 25°)
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

  return {
    range,
    v_roll_0,
    t_bounce,
    landing: toFieldCoords(range, theta_deg),
  }
}
