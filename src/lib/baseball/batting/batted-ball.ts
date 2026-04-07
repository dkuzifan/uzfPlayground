import type { ZoneType } from '../engine/types'
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
// v1: 기존 독립 EV/LA 생성 (fallback)
// ============================================================

function calcLaunchAngle(zoneType: ZoneType): number {
  const cfg = BATTED_BALL_CONFIG
  if (zoneType === 'dirt') {
    return gaussianRandom(cfg.launch_angle_base.low_zone, 8)
  }
  if (Math.random() < cfg.mixture_grounder_weight) {
    return gaussianRandom(cfg.mixture_grounder_mean, cfg.mixture_grounder_std)
  } else {
    return gaussianRandom(cfg.mixture_fly_mean, cfg.mixture_fly_std)
  }
}

export function calcBattedBall(
  zoneType: ZoneType,
  batter: BattingState['batter']
): { exit_velocity: number; launch_angle: number } {
  const cfg = BATTED_BALL_CONFIG
  const power_factor = 0.70 + (batter.stats.power / 100) * cfg.power_slope
  const sigma_ev = cfg.quality_std_base * (1 - batter.stats.contact / 200)
  const quality_roll = gaussianRandom(1.0, sigma_ev)
  const exit_velocity = cfg.base_exit_velocity * power_factor * quality_roll
  const launch_angle = calcLaunchAngle(zoneType)
  return { exit_velocity, launch_angle }
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
): BattedBallV2Result {
  const cfg = BATTED_BALL_CONFIG

  // ── EV ─────────────────────────────────────────────────
  // 기본값: Power vs BallPower 비교
  const power_advantage = (batter.stats.power - pitcher_power) / 100  // -1 ~ +1
  const base_ev = cfg.base_exit_velocity * (1.0 + power_advantage * 0.15)
    * (0.85 + pitch_speed_index * 0.15)  // 빠른 공일수록 반발력↑

  // 중심 적중 페널티: |center_offset|이 클수록 EV 급감
  // 정중앙(0) → 100%, 끝에 맞음(0.3+) → 50% 이하
  const center_penalty = Math.min(1.0, Math.abs(center_offset) * 3.0)
  const ev_factor = 1.0 - center_penalty * 0.6  // 최악: 40%까지 감소

  // 타이밍 페널티: 타이밍이 크게 빗나가면 EV도 하락
  const timing_penalty = Math.min(1.0, Math.abs(timing_offset) * 2.0)
  const timing_ev_factor = 1.0 - timing_penalty * 0.3  // 최악: 70%까지 감소

  // 노이즈
  const ev_noise = gaussianRandom(1.0, cfg.quality_std_base * (1 - batter.stats.contact / 200))

  const exit_velocity = Math.max(40, base_ev * ev_factor * timing_ev_factor * ev_noise)

  // ── LA ─────────────────────────────────────────────────
  // center_offset의 수직 성분이 주 결정 요인
  // 양수 (배트 아래 적중) → 높은 LA (플라이/팝업)
  // 음수 (배트 위 적중) → 낮은 LA (땅볼)
  // 0 (정중앙) → ~10-15° (라인드라이브)
  const base_la = 12  // 정중앙 기본 발사각
  const la_from_center = center_offset * 120  // 오프셋 0.1 → 12° 추가
  const la_noise = gaussianRandom(0, 6)  // 자연 분산

  const launch_angle = base_la + la_from_center + la_noise

  // ── θ (방향각) ──────────────────────────────────────────
  // timing_offset이 주 결정 요인
  // 양수 (빠른 스윙) → 당기기: 우타 좌측(-), 좌타 우측(+)
  // 음수 (느린 스윙) → 밀어치기: 반대
  const pull_sign: number = batter.bats === 'L' ? 1 : -1  // 좌타=당기기→우측(+), 우타=당기기→좌측(-)
  const theta_from_timing = timing_offset * 150 * pull_sign  // 오프셋 0.2 → 30° 이동

  // 배트 끝에 맞으면 방향 불안정성 추가
  const instability = Math.abs(center_offset) * 15  // 끝에 맞을수록 노이즈 증가
  const theta_noise = gaussianRandom(0, 8 + instability)

  const theta_h = theta_from_timing + theta_noise

  return { exit_velocity, launch_angle, theta_h }
}
