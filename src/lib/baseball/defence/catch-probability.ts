import type { Player } from '../types/player'
import type { FieldCoords, BallType } from './types'
import { FIELDER_DEFAULT_POS } from './fielder-positions'

// ============================================================
// 포구 확률 계산
// ============================================================

const MU_GROUND = 0.4  // 잔디 마찰 계수 (Phase B)

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
 * 타구 종류 × 수비수-착지 거리 × 수비 스탯 → 아웃 확률
 */
export function calcCatchProbability(
  ballType: BallType,
  d:        number,
  v_roll_0: number,
  fielder:  Player,
): number {
  const defence = fielder.stats.defence

  if (ballType === 'popup') return 1.0

  if (ballType === 'fly' || ballType === 'line_drive') {
    const coverage_radius = 6 + (defence / 100) * 6  // 6m ~ 12m
    const excess = Math.max(d - coverage_radius, 0)
    const base_p = ballType === 'line_drive' ? 0.35 : 0.95  // 라인드라이브는 base P_hit 높음
    return clamp(base_p - 0.05 * excess, 0.05, 0.95)
  }

  // grounder — Phase B 지수 감속 도달 시간
  if (v_roll_0 <= 0) return 1.0  // 공이 홈 근처에서 멈춤 → 내야 안타 불가

  const val = d * MU_GROUND / v_roll_0
  if (val >= 1) {
    // 공이 수비수까지 도달하기 전에 멈춤 → 무조건 아웃
    return 1.0
  }

  // t_ball = −ln(1 − d×μ/v_roll_0) / μ
  const t_ball = -Math.log(1 - val) / MU_GROUND

  const fielder_speed = 3.5 + (defence / 100) * 1.5  // 3.5 ~ 5.0 m/s
  const t_fielder     = 0.4 + d / fielder_speed       // 반응 시간 + 이동 시간

  return clamp(0.3 + (t_ball - t_fielder) * 0.15, 0.05, 0.90)
}
