import type { ZoneType } from '../engine/types'
import type { BattingState } from './types'
import { BATTED_BALL_CONFIG } from './config'

// ============================================================
// Box-Muller 정규분포 생성 유틸
// ============================================================

function gaussianRandom(mean: number, std: number): number {
  const u1 = Math.random()
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2)
  return mean + std * z
}

// ============================================================
// 발사각 계산 — 두 성분 혼합 분포 (MLB 기준 캘리브레이션)
//
// MLB 타구 분포 타겟:  ground ~41% / LD ~23% / fly ~29% / popup ~7%
// 두 성분:
//   grounder 성분 (weight w_g): N(μ_g, σ_g) → 땅볼 위주
//   fly 성분     (weight 1-w_g): N(μ_f, σ_f) → 뜬공/라인드라이브 위주
//
// 단일 Gaussian N(20, 25) 기준 LD ~46% 문제 해결.
// ============================================================

function calcLaunchAngle(zoneType: ZoneType): number {
  const cfg = BATTED_BALL_CONFIG

  // dirt 공 → 항상 낮은 발사각 (배트 끝에 맞아 굴러가는 타구)
  if (zoneType === 'dirt') {
    return gaussianRandom(cfg.launch_angle_base.low_zone, 8)
  }

  // 두 성분 혼합 분포
  if (Math.random() < cfg.mixture_grounder_weight) {
    return gaussianRandom(cfg.mixture_grounder_mean, cfg.mixture_grounder_std)
  } else {
    return gaussianRandom(cfg.mixture_fly_mean, cfg.mixture_fly_std)
  }
}

// ============================================================
// M6: 페어 컨택 품질 계산
// ============================================================

export function calcBattedBall(
  zoneType: ZoneType,
  batter: BattingState['batter']
): { exit_velocity: number; launch_angle: number } {
  const cfg = BATTED_BALL_CONFIG

  // 타구 속도
  const power_factor = 0.70 + (batter.stats.power / 100) * cfg.power_slope
  const sigma_ev = cfg.quality_std_base * (1 - batter.stats.contact / 200)
  const quality_roll = gaussianRandom(1.0, sigma_ev)
  const exit_velocity = cfg.base_exit_velocity * power_factor * quality_roll

  // 발사각 — 두 성분 혼합 분포 적용
  const launch_angle = calcLaunchAngle(zoneType)

  return { exit_velocity, launch_angle }
}
