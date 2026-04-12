import type { Player, PitchTypeData } from '../types/player'
import type { ZoneId } from './types'
import { SCATTER_CONFIG, BATTER_BODY } from './config'
import { classifyZone } from './zone-classify'
import { pickTargetInZone } from '../batting/zone-proximity'

// ============================================================
// Box-Muller 가우시안 난수
// ============================================================

function gaussianRandom(mean: number, sigma: number): number {
  const u1 = Math.random()
  const u2 = Math.random()
  return mean + sigma * Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2)
}

// ============================================================
// σ 계산 (Step 9 trade-off에서 재사용 가능하도록 분리)
// ============================================================

export function computeBaseSigma(
  pitchData: PitchTypeData,
  remainingStamina: number,
  maxStamina: number,
): { sigma_x: number; sigma_z: number } {
  const { sigma_min, sigma_max, axis_ratio, fatigue_mult } = SCATTER_CONFIG

  const controlNorm = Math.max(0, Math.min(1, pitchData.ball_control / 100))
  const sigma_base = sigma_max - controlNorm * (sigma_max - sigma_min)

  const staminaRatio  = maxStamina > 0 ? remainingStamina / maxStamina : 1
  const fatigueFactor = 1 + fatigue_mult * (1 - staminaRatio)

  const sigma_x = sigma_base * fatigueFactor
  const sigma_z = sigma_x * axis_ratio
  return { sigma_x, sigma_z }
}

// 존 내 의도된 타겟 좌표 선택 — throw-pitch에서 Step 9 체크용으로 재사용
export function pickTargetCoords(
  targetZone: ZoneId,
  batter: Player,
): { x: number; z: number } {
  return pickTargetInZone(targetZone, batter.zone_bottom, batter.zone_top)
}

// ============================================================
// M5: 제구 오차 + HBP 판정 (v2: 가우시안 분포)
// ============================================================

export interface ScatterOpts {
  // 사전 선택된 타겟 좌표 (Step 9에서 k 계산을 위해 사전 picked)
  target?: { x: number; z: number }
  // σ 사후 스케일 (Step 9: σ × k)
  sigmaScale?: number
}

export function applyControlScatter(
  targetZone: ZoneId,
  pitchData: PitchTypeData,
  remainingStamina: number,
  maxStamina: number,
  batter: Player,
  opts: ScatterOpts = {},
): { actual_x: number; actual_z: number; actual_zone: ZoneId; is_hbp: boolean } {
  const base = computeBaseSigma(pitchData, remainingStamina, maxStamina)
  const scale = opts.sigmaScale ?? 1.0
  const sigma_x = base.sigma_x * scale
  const sigma_z = base.sigma_z * scale

  // 타겟 좌표: 사전 선택된 값 우선, 없으면 내부에서 pickTargetInZone
  const target = opts.target ?? pickTargetInZone(targetZone, batter.zone_bottom, batter.zone_top)
  const cx = target.x
  const cz = target.z
  const dx = gaussianRandom(0, sigma_x)
  const dz = gaussianRandom(0, sigma_z)

  const actual_x = cx + dx
  const actual_z = cz + dz

  // HBP 판정 (우타자 기준; 좌타자 x 반전)
  const bodyX = batter.bats === 'L'
    ? { min: -BATTER_BODY.x_max, max: -BATTER_BODY.x_min }
    : { min: BATTER_BODY.x_min,  max: BATTER_BODY.x_max }

  const is_hbp =
    actual_x >= bodyX.min       && actual_x <= bodyX.max &&
    actual_z >= BATTER_BODY.z_min && actual_z <= BATTER_BODY.z_max

  // 실제 존 역산
  const { zone_id: actual_zone } = classifyZone(actual_x, actual_z, batter)

  return { actual_x, actual_z, actual_zone, is_hbp }
}
