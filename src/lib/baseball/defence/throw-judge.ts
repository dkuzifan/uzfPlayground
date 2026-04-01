import type { Player } from '../types/player'

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
// sigmoid 유틸
// ============================================================

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
): 'safe' | 'out' {
  const throw_speed  = (80 + thrower.stats.throw * 0.7) / 3.6   // m/s
  const runner_speed = 5.0 + (runner.stats.running / 100) * 3.0  // m/s

  const t_throw  = throw_dist / throw_speed
  const t_runner = runner_dist / runner_speed
  const t_total  = t_fielding + t_throw

  // margin > 0 → 주자가 먼저 도달 (safe)
  const margin = t_total - t_runner
  const p_safe = sigmoid(margin, 0.5)

  return Math.random() < p_safe ? 'safe' : 'out'
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
