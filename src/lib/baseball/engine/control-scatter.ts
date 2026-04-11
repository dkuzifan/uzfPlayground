import type { Player, PitchTypeData } from '../types/player'
import type { ZoneId } from './types'
import { SCATTER_CONFIG, BATTER_BODY } from './config'
import { classifyZone } from './zone-classify'
import { pickTargetInZone } from '../batting/zone-proximity'

// ============================================================
// 존 중심 좌표 테이블 (m, 홈플레이트 중심 기준)
// 스트라이크 존 1~9: 3×3 그리드 (x: -0.14, 0, +0.14 / z: 가변)
// 볼 존: 존 경계 바깥 중심
// ============================================================

// 우타자 기준 x 중심 (좌 / 중 / 우)
const X_CENTERS = [-0.14, 0.0, 0.14]  // col 2,3,4 (strike zone columns)
// ABS 스트라이크 존 좌우 경계: ±(PLATE_HALF_WIDTH + ABS_MARGIN_X) = ±0.4684m
// 볼 존 중심은 이 경계 바깥에 위치해야 함
const X_LEFT_BALL  = -0.58            // B2x 좌측 볼 중심 (ABS 경계 -0.4684m 바깥)
const X_RIGHT_BALL =  0.58            // B2x 우측 볼 중심

// 스트라이크 존 z 중심 계산용 — 런타임에 batter 데이터로 계산
function strikeZCenters(zoneBottom: number, zoneTop: number): [number, number, number] {
  const h = (zoneTop - zoneBottom) / 3
  return [
    zoneTop    - h / 2,   // 상단 스트라이크 행
    zoneBottom + h * 1.5, // 중단
    zoneBottom + h / 2,   // 하단
  ]
}

const Z_HIGH_BALL = (zoneTop: number)    => zoneTop    + 0.25
const Z_LOW_BALL  = (zoneBottom: number) => zoneBottom - 0.25

// ZoneId → 중심 좌표
function zoneCenterXZ(
  zone: ZoneId,
  zoneBottom: number,
  zoneTop: number
): { cx: number; cz: number } {
  const zCenters = strikeZCenters(zoneBottom, zoneTop)

  switch (zone) {
    // 스트라이크 존 1~9
    case 1: return { cx: X_CENTERS[0], cz: zCenters[0] }
    case 2: return { cx: X_CENTERS[1], cz: zCenters[0] }
    case 3: return { cx: X_CENTERS[2], cz: zCenters[0] }
    case 4: return { cx: X_CENTERS[0], cz: zCenters[1] }
    case 5: return { cx: X_CENTERS[1], cz: zCenters[1] }
    case 6: return { cx: X_CENTERS[2], cz: zCenters[1] }
    case 7: return { cx: X_CENTERS[0], cz: zCenters[2] }
    case 8: return { cx: X_CENTERS[1], cz: zCenters[2] }
    case 9: return { cx: X_CENTERS[2], cz: zCenters[2] }
    // 상단 볼
    case 'B11': return { cx: X_LEFT_BALL,   cz: Z_HIGH_BALL(zoneTop) }
    case 'B12': return { cx: X_CENTERS[0],  cz: Z_HIGH_BALL(zoneTop) }
    case 'B13': return { cx: X_CENTERS[1],  cz: Z_HIGH_BALL(zoneTop) }
    case 'B14': return { cx: X_CENTERS[2],  cz: Z_HIGH_BALL(zoneTop) }
    case 'B15': return { cx: X_RIGHT_BALL,  cz: Z_HIGH_BALL(zoneTop) }
    // 좌우 볼 (중단)
    case 'B21': return { cx: X_LEFT_BALL,   cz: zCenters[0] }
    case 'B22': return { cx: X_RIGHT_BALL,  cz: zCenters[0] }
    case 'B23': return { cx: X_LEFT_BALL,   cz: zCenters[1] }
    case 'B24': return { cx: X_RIGHT_BALL,  cz: zCenters[1] }
    case 'B25': return { cx: X_LEFT_BALL,   cz: zCenters[2] }
    case 'B26': return { cx: X_RIGHT_BALL,  cz: zCenters[2] }
    // 하단 볼 (dirt)
    case 'B31': return { cx: X_LEFT_BALL,   cz: Z_LOW_BALL(zoneBottom) }
    case 'B32': return { cx: X_CENTERS[0],  cz: Z_LOW_BALL(zoneBottom) }
    case 'B33': return { cx: X_CENTERS[1],  cz: Z_LOW_BALL(zoneBottom) }
    case 'B34': return { cx: X_CENTERS[2],  cz: Z_LOW_BALL(zoneBottom) }
    case 'B35': return { cx: X_RIGHT_BALL,  cz: Z_LOW_BALL(zoneBottom) }
  }
}

// ============================================================
// Box-Muller 가우시안 난수
// ============================================================

function gaussianRandom(mean: number, sigma: number): number {
  const u1 = Math.random()
  const u2 = Math.random()
  return mean + sigma * Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2)
}

// ============================================================
// M5: 제구 오차 + HBP 판정 (v2: 가우시안 분포)
// ============================================================

export function applyControlScatter(
  targetZone: ZoneId,
  pitchData: PitchTypeData,
  remainingStamina: number,
  maxStamina: number,
  batter: Player
): { actual_x: number; actual_z: number; actual_zone: ZoneId; is_hbp: boolean } {
  const { sigma_min, sigma_max, axis_ratio, fatigue_mult } = SCATTER_CONFIG

  // σ = f(BallControl): Control 100 → σ_min, Control 0 → σ_max
  const controlNorm = Math.max(0, Math.min(1, pitchData.ball_control / 100))
  const sigma_base = sigma_max - controlNorm * (sigma_max - sigma_min)

  // 스태미나 피로 보정: 피로하면 σ 증가
  const staminaRatio  = maxStamina > 0 ? remainingStamina / maxStamina : 1
  const fatigueFactor = 1 + fatigue_mult * (1 - staminaRatio)

  const sigma_x = sigma_base * fatigueFactor
  const sigma_z = sigma_x * axis_ratio

  // 존 내 의도된 타겟 좌표 선택 (존 타입별 분포)
  const target = pickTargetInZone(targetZone, batter.zone_bottom, batter.zone_top)
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
