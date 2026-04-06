import type { Player, Position } from '../types/player'
import { THROW_ERROR_COEFF } from '../game/config'

// ============================================================
// Vec2 — 2D 좌표 타입
// ============================================================

export type Vec2 = { x: number; y: number }

// ============================================================
// BallState — 공의 현재 상태와 남은 시간
//
// t_remaining: 이 결정 시점에서 해당 phase가 완료될 때까지 남은 시간 (s)
// 호출자(resolveRunnerAdvances)가 runner 이동 시간을 반영해 t_remaining을 조정해 전달
// ============================================================

export type BallState =
  | { phase: 'in_air';          t_remaining: number; catch_probability: number;
      fielder_pos: Vec2; fielder: Player }
  | { phase: 'fielding';        t_remaining: number;
      fielder_pos: Vec2; fielder: Player }
  | { phase: 'throw_in_flight'; t_remaining: number;
      target: BaseKey; receiver_pos: Vec2; receiver: Player }
  | { phase: 'held';            fielder: Player; fielder_pos: Vec2 }

// ============================================================
// 베이스 좌표 상수
// 원점 = 홈 플레이트, +y = 중견수 방향, +x = 1루 방향
// 1루~홈 = 27.43m, 대각선 = 27.43 × √2 = 38.8m
// ============================================================

export const BASE_POS = {
  home: { x:    0,   y:    0   },
  '1B': { x:  19.4,  y:  19.4  },
  '2B': { x:    0,   y:  38.8  },
  '3B': { x: -19.4,  y:  19.4  },
} as const

export type BaseKey = keyof typeof BASE_POS

// ============================================================
// 공통 유틸
// ============================================================

export function euclidDist(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function sigmoid(x: number, scale: number): number {
  return 1 / (1 + Math.exp(-x / scale))
}

// ============================================================
// resolveThrow — 송구 결과 판정
//
// thrower    : 송구하는 수비수
// throw_dist : 수비수 위치 → 목표 베이스 거리 (m)
// t_fielding : 포구까지 걸린 시간 (s) = t_ball_travel + 0.3
// runner     : 진루 시도 주자
// runner_dist: 목표 베이스까지 남은 거리 (m)
// ============================================================

export function resolveThrow(
  thrower:     Player,
  throw_dist:  number,
  t_fielding:  number,
  runner:      Player,
  runner_dist: number,
): 'safe' | 'out' | 'wild_throw' {
  const throw_speed  = (80 + thrower.stats.throw * 0.7) / 3.6   // m/s
  const runner_speed = 5.0 + (runner.stats.running / 100) * 3.0  // m/s

  const t_throw  = throw_dist / throw_speed
  const t_runner = runner_dist / runner_speed
  const t_total  = t_fielding + t_throw

  // margin > 0 → 주자가 먼저 도달 (safe)
  const margin = t_total - t_runner
  const p_safe = sigmoid(margin, 0.5)

  const verdict = Math.random() < p_safe ? 'safe' : 'out'

  // 아웃 직전에만 폭투 가능 (safe는 이미 주자 유리)
  if (verdict === 'out') {
    const p_throw_error = THROW_ERROR_COEFF
      * (1 - thrower.stats.throw / 100)
      * Math.max(0.3, Math.min(1.0, throw_dist / 60))
    if (Math.random() < p_throw_error) return 'wild_throw'
  }

  return verdict
}

// ============================================================
// maxDirectDist — Throw 스탯 기준 직접 송구 최대 유효 거리
//
// "직접 송구"는 바운드 포함 — 중계수를 거치지 않는 모든 송구.
// 앵커: Throw 30 → 35m, Throw 100 → 85m (로그 감쇠)
//   Throw 90  → 81m  (LF/RF→홈 직접 가능)
//   Throw 110 → 89m  (CF→홈 직접 가능)
// ============================================================

export function maxDirectDist(throw_stat: number): number {
  return 41.5 * Math.log(throw_stat) - 106
}

// ============================================================
// calcRelayPos — 중계 위치 산출
//
// 외야수와 목표 베이스 사이 45% 지점 (중계수가 OF 방향으로 나가는 경험칙)
// ============================================================

export function calcRelayPos(
  fielder_pos:     { x: number; y: number },
  target_base_pos: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: fielder_pos.x + (target_base_pos.x - fielder_pos.x) * 0.45,
    y: fielder_pos.y + (target_base_pos.y - fielder_pos.y) * 0.45,
  }
}

// ============================================================
// selectRelayMan — 중계수 선택
//
// fielder_pos.x > 0 (우측 외야: RF, 우중간 CF) → SS
// fielder_pos.x ≤ 0 (좌측 외야: LF, 좌중간 CF) → 2B
// lineup에 없으면 dummy (Throw 70) 반환
// ============================================================

export function selectRelayMan(
  fielder_pos:   { x: number; y: number },
  defenceLineup: Player[],
): Player {
  const targetPos: Position = fielder_pos.x > 0 ? 'SS' : '2B'
  const found = defenceLineup.find(
    p => p.position_1 === targetPos || p.position_2 === targetPos,
  )
  if (found) return found

  return {
    id: 'relay_dummy', team_id: '', name: 'Relay', number: 0,
    age: 25, bats: 'R', throws: 'R',
    position_1: targetPos, position_2: null, position_3: null,
    stats: {
      ball_power: 0, ball_control: 0, ball_break: 0, ball_speed: 0,
      contact: 50, power: 50, defence: 50, throw: 70, running: 50, stamina: 100,
    },
    pitch_types: [], zone_bottom: 0.5, zone_top: 1.1, portrait_url: null,
  }
}

// ============================================================
// shouldUseRelay — 직접 송구 vs 중계 플레이 판단
//
// ① 도달 불가: dist > maxDirectDist(throw_stat) → relay
// ② 도달 가능이더라도 중계가 더 빠르면 → relay
// 동점 시(t_direct === t_relay) → 직접 송구 유지
// ============================================================

export function shouldUseRelay(
  fielder:     Player,
  fielder_pos: { x: number; y: number },
  targetPos:   { x: number; y: number },
  t_fielding:  number,
  relayMan:    Player,
  relayPos:    { x: number; y: number },
): boolean {
  const spd_OF    = (80 + fielder.stats.throw  * 0.7) / 3.6
  const spd_relay = (80 + relayMan.stats.throw * 0.7) / 3.6
  const dist_direct = euclidDist(fielder_pos, targetPos)

  // ① 도달 불가
  if (dist_direct > maxDirectDist(fielder.stats.throw)) return true

  // ② 속도 비교 (중계가 더 빠른 경우에만 relay 사용)
  const t_direct = t_fielding + dist_direct / spd_OF
  const t_relay  = t_fielding
                 + euclidDist(fielder_pos, relayPos) / spd_OF
                 + 0.5
                 + euclidDist(relayPos, targetPos)   / spd_relay

  return t_relay < t_direct
}

// ============================================================
// resolveRelayThrow — 중계 플레이 판정
//
// t_total = t_fielding
//         + t_throw_to_relay   (OF 송구 → 중계 위치)
//         + t_relay_reaction   (수신 + 방향전환 + 투구, 고정 0.5s)
//         + t_throw_from_relay (중계수 → 목표 베이스)
// ============================================================

export function resolveRelayThrow(
  fielder:      Player,
  fielder_pos:  { x: number; y: number },
  relayMan:     Player,
  targetPos:    { x: number; y: number },
  t_fielding:   number,
  runner:       Player,
  runner_dist:  number,
): 'safe' | 'out' | 'wild_throw' {
  const spd_OF    = (80 + fielder.stats.throw  * 0.7) / 3.6
  const spd_relay = (80 + relayMan.stats.throw * 0.7) / 3.6
  const relay_pos = calcRelayPos(fielder_pos, targetPos)

  const t_total = t_fielding
                + euclidDist(fielder_pos, relay_pos) / spd_OF
                + 0.8
                + euclidDist(relay_pos, targetPos)   / spd_relay

  const runner_speed = 5.0 + (runner.stats.running / 100) * 3.0
  const t_runner     = runner_dist / runner_speed
  const margin       = t_total - t_runner

  const verdict = Math.random() < sigmoid(margin, 0.5) ? 'safe' : 'out'

  if (verdict === 'out') {
    const throw_dist    = euclidDist(relay_pos, targetPos)
    const p_throw_error = THROW_ERROR_COEFF
      * (1 - relayMan.stats.throw / 100)
      * Math.max(0.3, Math.min(1.0, throw_dist / 60))
    if (Math.random() < p_throw_error) return 'wild_throw'
  }

  return verdict
}

// ============================================================
// calcOverrunDist — 외야 타구 타자의 1루 오버런 거리
//
// run_intensity = clamp(t_ball_travel / 3.0, 0.7, 1.0)
//   얕은 타구(짧은 비행) → 보수적 주루
//   깊은 타구(긴 비행)   → 전력 질주
// overrun_dist = run_intensity × runner_speed × k (k ≈ 0.3s)
// ============================================================

export function calcOverrunDist(
  t_ball_travel: number,
  runner:        Player,
): number {
  const runner_speed   = 5.0 + (runner.stats.running / 100) * 3.0
  const run_intensity  = Math.max(0.7, Math.min(1.0, t_ball_travel / 3.0))
  return run_intensity * runner_speed * 0.3
}

// ============================================================
// calcRemainingTo2B — t_bounce 시점 타자의 2루까지 남은 거리
//
// 타자가 이미 뛴 거리: batter_run = runner_speed × t_ball_travel
// overrun_pos = 1B_pos + normalize(1B_pos) × overrun_dist
// remaining   = dist(overrun_pos, 2B_pos)
// ============================================================

export function calcRemainingTo2B(
  t_ball_travel: number,
  batter:        Player,
): number {
  const runner_speed = 5.0 + (batter.stats.running / 100) * 3.0
  const batter_run   = runner_speed * t_ball_travel
  const overrun_dist = calcOverrunDist(t_ball_travel, batter)

  // overrun 지점 좌표: 1루 방향으로 overrun_dist 연장
  // normalize((19.4, 19.4)) = (1/√2, 1/√2)
  const inv_sqrt2 = 1 / Math.SQRT2
  const overrun_x = BASE_POS['1B'].x + inv_sqrt2 * overrun_dist
  const overrun_y = BASE_POS['1B'].y + inv_sqrt2 * overrun_dist

  // overrun 지점 → 2루 직선 거리
  const dist_overrun_to_2B = Math.sqrt(
    (BASE_POS['2B'].x - overrun_x) ** 2 +
    (BASE_POS['2B'].y - overrun_y) ** 2,
  )

  const dist_1B = 27.43

  if (batter_run < dist_1B) {
    // 아직 1루 전: 남은 1루 거리 + overrun + overrun지점→2루
    return (dist_1B - batter_run) + overrun_dist + dist_overrun_to_2B
  } else {
    // 1루 지나침: 이미 지나친 만큼 overrun 거리에서 차감 후 2루까지
    const already_past = batter_run - dist_1B
    const remaining_overrun = Math.max(0, overrun_dist - already_past)
    return remaining_overrun + dist_overrun_to_2B
  }
}
