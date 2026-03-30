import type { AtBatResult } from './types'
import { BATTED_BALL_CONFIG, HIT_RESULT_TABLE, type EVTier, type LATier } from './config'

// ============================================================
// 가중치 랜덤 선택 유틸
// ============================================================

function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

// ============================================================
// M7: 타구 결과 판정
// 수비 엔진 구현 시 이 함수의 구현체만 교체 (시그니처 유지)
// ============================================================

export function resolveHitResult(
  exit_velocity: number,
  launch_angle: number
): Exclude<AtBatResult, 'in_progress' | 'strikeout' | 'walk' | 'hit_by_pitch'> {
  const { ev_tiers, la_tiers } = BATTED_BALL_CONFIG

  // EV 구간 분류
  const ev_tier: EVTier =
    exit_velocity <= ev_tiers.soft   ? 'soft' :
    exit_velocity <= ev_tiers.medium ? 'medium' :
    exit_velocity <= ev_tiers.hard   ? 'hard' : 'very_hard'

  // LA 구간 분류
  const la_tier: LATier =
    launch_angle <= la_tiers.ground     ? 'ground' :
    launch_angle <= la_tiers.line_drive ? 'line_drive' :
    launch_angle <= la_tiers.fly        ? 'fly' : 'popup'

  const weights = HIT_RESULT_TABLE[ev_tier][la_tier]
  const outcomes = ['home_run', 'triple', 'double', 'single', 'out'] as const

  return weightedRandom([...outcomes], weights)
}
