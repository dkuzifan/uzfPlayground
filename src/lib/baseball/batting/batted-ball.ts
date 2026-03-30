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

// 존 높이 분류 (스트라이크 존 기준)
function getZoneHeight(zoneType: ZoneType): 'high' | 'mid' | 'low' {
  // zone_type만으로 높이를 완벽히 알 수 없으므로
  // core/edge는 mid로 처리, 볼 존은 위치에 따라 다르지만 중간값 사용
  // 실제 ZoneId 기반 높이 분류는 게임 루프에서 actual_zone으로 처리 가능
  switch (zoneType) {
    case 'core':  return 'mid'
    case 'edge':  return 'mid'
    case 'chase': return 'mid'
    case 'ball':  return 'mid'
    case 'dirt':  return 'low'
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

  // 발사각
  const height = getZoneHeight(zoneType)
  const angle_base =
    height === 'high' ? cfg.launch_angle_base.high_zone :
    height === 'low'  ? cfg.launch_angle_base.low_zone :
                        cfg.launch_angle_base.mid_zone
  const noise_std = cfg.launch_noise_base * (1 - batter.stats.contact / 200)
  const launch_angle = gaussianRandom(angle_base, noise_std)

  return { exit_velocity, launch_angle }
}
