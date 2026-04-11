import type { BattingState } from './types'
import type { Handedness } from '../types/player'
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
// v2: 통합 EV/LA/θ 생성 (timing + center offset 기반)
//
// center_offset → EV (주), LA (주)
// timing_offset → θ (주)
// center_offset → θ (부, 불안정성 noise)
// ============================================================

export interface BattedBallV2Result {
  exit_velocity:  number   // km/h
  launch_angle:   number   // °
  theta_h:        number   // 방향각 ° (0=중견수, +=우측, -=좌측)
}

/**
 * timing_offset과 center_offset에서 EV, LA, 방향각을 통합 생성.
 *
 * @param timing_offset  타이밍 오차 (양수=빠름=당기기, 음수=느림=밀어치기)
 * @param center_offset  배트 중심 적중 오차 (양수=아래쪽=플라이, 음수=위쪽=땅볼)
 * @param batter         타자 (Power, Contact, bats)
 * @param pitcher_power  투수 구위 (BallPower)
 * @param pitch_speed_index  투구 속도 지표 (0~1, 패스트볼=1.0)
 */
export function calcBattedBallV2(
  timing_offset:     number,
  center_offset:     number,
  batter:            BattingState['batter'],
  pitcher_power:     number,
  pitch_speed_index: number,
  pitcher_throws?:   Handedness,
): BattedBallV2Result {
  const cfg = BATTED_BALL_CONFIG

  const v2 = cfg.v2

  // ── EV ─────────────────────────────────────────────────
  // Power 스탯 → EV 기본 배율 (v1과 동일 구조 유지)
  const power_factor = 0.70 + (batter.stats.power / 100) * cfg.power_slope  // 0.70~1.30
  // Power vs BallPower 매치업 보정
  const matchup_mod = 1.0 + ((batter.stats.power - pitcher_power) / 100) * v2.power_advantage_scale
  const base_ev = cfg.base_exit_velocity * power_factor * matchup_mod
    * (v2.pitch_speed_ev_base + pitch_speed_index * v2.pitch_speed_ev_scale)

  const center_penalty = Math.min(1.0, Math.abs(center_offset) * v2.center_penalty_k)
  const ev_factor = 1.0 - center_penalty * v2.center_penalty_max

  const timing_penalty = Math.min(1.0, Math.abs(timing_offset) * v2.timing_penalty_k)
  const timing_ev_factor = 1.0 - timing_penalty * v2.timing_penalty_max

  const ev_noise = gaussianRandom(1.0, cfg.quality_std_base * (1 - batter.stats.contact / 200))
  const exit_velocity = Math.max(v2.min_ev, base_ev * ev_factor * timing_ev_factor * ev_noise)

  // ── LA ─────────────────────────────────────────────────
  // 하이브리드: v1 mixture 기저 + center_offset 보정
  // mixture: 45% 땅볼 성분 N(0,10) + 55% 뜬공 성분 N(30,13) → MLB 이봉 분포
  // center_offset: 배트 아래 적중(+) → LA↑, 위 적중(-) → LA↓
  let base_la: number
  if (Math.random() < cfg.mixture_grounder_weight) {
    base_la = gaussianRandom(cfg.mixture_grounder_mean, cfg.mixture_grounder_std)
  } else {
    base_la = gaussianRandom(cfg.mixture_fly_mean, cfg.mixture_fly_std)
  }
  const la_from_center = center_offset * v2.center_to_la_k
  const launch_angle = base_la + la_from_center

  // ── θ (방향각) ──────────────────────────────────────────
  // 스위치 타자: 투수 반대 손으로 타격 (vs 우투→좌타, vs 좌투→우타)
  const effective_bats: 'L' | 'R' = batter.bats === 'S'
    ? (pitcher_throws === 'L' ? 'R' : 'L')  // 스위치: 투수 반대
    : batter.bats === 'L' ? 'L' : 'R'
  const pull_sign: number = effective_bats === 'L' ? 1 : -1
  const theta_from_timing = timing_offset * v2.timing_to_theta_k * pull_sign

  const instability = Math.abs(center_offset) * v2.center_instability_k
  const theta_noise = gaussianRandom(0, v2.theta_base_noise_std + instability)

  const theta_h = theta_from_timing + theta_noise

  return { exit_velocity, launch_angle, theta_h }
}
