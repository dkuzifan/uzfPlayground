import type { Player } from '../types/player'
import { PLATE_HALF_WIDTH, ABS_MARGIN_X, ABS_MARGIN_Z, POWER_TRADEOFF_CONFIG } from './config'

// ============================================================
// Step 9 — 3-0 구위 트레이드오프
//
// 주어진 타겟 좌표 (tx, tz)와 기본 σ에서, P(strike) ≥ target_prob
// 이 되도록 σ(그리고 ball_power)를 얼마나 축소해야 하는지 계산.
//
// 축소율 k ∈ (k_min, 1.0]. σ' = σ × k, ball_power' = ball_power × k.
// k=1.0 의미: 축소 불필요 (이미 충분히 스트라이크).
// ============================================================

// Abramowitz & Stegun 7.1.26 — erf 근사 (오차 ~1.5e-7)
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const a1 =  0.254829592
  const a2 = -0.284496736
  const a3 =  1.421413741
  const a4 = -1.453152027
  const a5 =  1.061405429
  const p  =  0.3275911
  const t = 1 / (1 + p * ax)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax)
  return sign * y
}

// 표준 정규 CDF
function normalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2))
}

// ============================================================
// 스트라이크 존 경계 (ABS)
// ============================================================

function strikeZoneBounds(batter: Player) {
  const x_half = PLATE_HALF_WIDTH + ABS_MARGIN_X
  return {
    x_lo: -x_half,
    x_hi:  x_half,
    z_lo: batter.zone_bottom - ABS_MARGIN_Z,
    z_hi: batter.zone_top    + ABS_MARGIN_Z,
  }
}

// ============================================================
// P(strike) — 2D 독립 가우시안 적분
// ============================================================

export function calcPStrike(
  tx: number,
  tz: number,
  sigma_x: number,
  sigma_z: number,
  batter: Player,
): number {
  const { x_lo, x_hi, z_lo, z_hi } = strikeZoneBounds(batter)
  const p_x = normalCDF((x_hi - tx) / sigma_x) - normalCDF((x_lo - tx) / sigma_x)
  const p_z = normalCDF((z_hi - tz) / sigma_z) - normalCDF((z_lo - tz) / sigma_z)
  return p_x * p_z
}

// ============================================================
// 최소 구위 감소율 k 탐색
// ============================================================
//
// k=1.0에서 이미 P ≥ target → k=1.0 반환
// 그렇지 않으면 이진탐색으로 P(k) = target_prob 근사
//
// 반환값: { k, p_strike_at_k }
//
export function findMinimalPowerReduction(
  tx: number,
  tz: number,
  sigma_x_base: number,
  sigma_z_base: number,
  batter: Player,
): { k: number; p_strike: number } {
  const { target_strike_prob, binary_search_iter, k_min } = POWER_TRADEOFF_CONFIG

  // 1) 감소 없이 이미 충분한지 체크
  const p_full = calcPStrike(tx, tz, sigma_x_base, sigma_z_base, batter)
  if (p_full >= target_strike_prob) {
    return { k: 1.0, p_strike: p_full }
  }

  // 2) 이진탐색: k_min ~ 1.0 범위에서 P(k) ≥ target_prob 만족하는 최대 k (=최소 감소)
  let lo = k_min
  let hi = 1.0

  // 극단 케이스: k_min에서도 P < target → 최대 감소 (k_min) 사용
  const p_min = calcPStrike(
    tx, tz,
    sigma_x_base * k_min,
    sigma_z_base * k_min,
    batter,
  )
  if (p_min < target_strike_prob) {
    return { k: k_min, p_strike: p_min }
  }

  // 불변식: P(hi) ≥ target, P(lo) < target  → 답은 [lo, hi]
  // hi는 축소율이 작은 쪽(=감소 많음, P 큼), lo는 축소 큰 쪽... 엥 반대임.
  //
  // k가 작을수록 σ가 작아져 P가 커진다.
  // 즉 k ↓ → P ↑. 우리는 P ≥ target 을 만족하는 "가장 큰 k" 를 찾아야 함.
  //
  // 초기: P(1.0) < target, P(k_min) ≥ target
  // → 답 k* ∈ (k_min, 1.0)
  // 이진탐색: mid 에서 P(mid) 체크
  //   P(mid) ≥ target → k*는 mid 이상 → lo = mid
  //   P(mid) <  target → k*는 mid 미만 → hi = mid
  lo = k_min   // P(lo) ≥ target
  hi = 1.0     // P(hi) < target

  for (let i = 0; i < binary_search_iter; i++) {
    const mid = (lo + hi) / 2
    const p_mid = calcPStrike(
      tx, tz,
      sigma_x_base * mid,
      sigma_z_base * mid,
      batter,
    )
    if (p_mid >= target_strike_prob) {
      lo = mid
    } else {
      hi = mid
    }
  }

  const k = lo
  const p_strike = calcPStrike(
    tx, tz,
    sigma_x_base * k,
    sigma_z_base * k,
    batter,
  )
  return { k, p_strike }
}
