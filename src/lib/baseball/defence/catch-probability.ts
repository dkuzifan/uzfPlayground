import type { Player } from '../types/player'
import type { FieldCoords, BallType } from './types'
import { FIELDER_DEFAULT_POS } from './fielder-positions'
import { PHYSICS_CONFIG } from './config'

// ============================================================
// 포구 확률 계산
// ============================================================

const MU_GROUND = 0.4  // 잔디 마찰 계수 (Phase B 땅볼용)

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

  // 내야 땅볼 — 거리·속도 기반 범위 모델
  // 땅볼은 공이 구르기 때문에 수비수가 공을 보며 이동할 시간이 충분히 있다.
  // reachable_dist: 2.5초 이내 이동 가능 거리 (타구 → 착지 전체 시간)
  // speed_penalty: 빠른 타구일수록 정면 돌파가 어려움 (최대 0.12)
  const fielder_speed_g = 4.0 + (defence / 100) * 2.0  // 4.0–6.0 m/s
  const reachable_dist  = fielder_speed_g * 1.8          // 1.8초 이내 이동 가능 거리
  const speed_penalty   = Math.min(0.18, v_roll_0 / 20 * 0.18)  // 속구 페널티 최대 0.18
  const excess          = Math.max(0, d - reachable_dist)
  return clamp(0.90 - 0.10 * excess - speed_penalty, 0.05, 0.90)
}
