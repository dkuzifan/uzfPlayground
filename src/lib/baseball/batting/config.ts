import type { ZoneType } from '../engine/types'

// ============================================================
// Swing Decision
// ============================================================

// MLB 기준: 스트라이크 존 스윙률 ~68%, 볼 존 스윙률(체이스율) ~29%, 전체 스윙률 ~47%
// core=0.85, edge=0.65로 설정 시 전체 스윙률~62% (MLB 47% 초과) → 하향 조정
export const SWING_CONFIG = {
  base_swing: {
    core:  0.72,
    edge:  0.55,
    chase: 0.22,
    ball:  0.07,
    dirt:  0.07,
  } satisfies Record<ZoneType, number>,
  count_modifier: {
    '0-2': +0.10,   // 타자 수세 → 공격적 스윙
    '3-0': -0.15,   // 볼카운트 유리 → 소극적
    '3-2': +0.05,
  } as Record<string, number>,
  eye_default: 50,  // Eye 스탯 미구현 시 기본값 → modifier = 0
}

// ============================================================
// Contact
// ============================================================

export const CONTACT_CONFIG = {
  // base_contact = intercept + (Contact/100) × slope
  // MLB 컨택률: 스트라이크 존 ~80%, 체이스 ~55%
  // 헛스윙 과다 문제 해결: core/edge intercept 상향, pitch_modifier_max 인하
  base_contact: {
    core:  { intercept: 0.65, slope: 0.30 },  // 0.65 ~ 0.95  (contact=75: 0.875)
    edge:  { intercept: 0.52, slope: 0.28 },  // 0.52 ~ 0.80  (contact=75: 0.73)
    chase: { intercept: 0.20, slope: 0.22 },  // 0.20 ~ 0.42  (contact=75: 0.365)
    ball:  { intercept: 0.05, slope: 0.15 },  // 0.05 ~ 0.20
    dirt:  { intercept: 0.10, slope: 0.15 },  // 0.10 ~ 0.25
  } satisfies Record<ZoneType, { intercept: number; slope: number }>,
  pitch_modifier_max: 0.18,      // 구종 난이도 최대 페널티 (0.30→0.18 인하: 헛스윙 과다 방지)
  familiarity_bonus_max: 0.15,   // familiarity 최대 보너스 +15%
  // 2-스트라이크 컨택 보너스: 타자가 배트를 짧게 잡고 플레이트를 보호하는 현실 반영
  // 이 보너스로 2스트라이크 헛스윙 감소 → K% 하향 → MLB 수준에 근접
  two_strike_contact_bonus: 0.20,
  // 컨택 성공 시 페어 확률
  // 인플레이 비율 22.9% → 목표 ~17% (MLB 수준)
  // fair_prob 하향: 파울 증가 → at-bat 연장 → BB 누적 기회↑
  // (이전 fair_prob=0.55 시 K↑ 이슈는 당시 낮은 컨택률 때문; 현재 컨택률 ~75%이므로 재시도)
  fair_prob: {
    core:  0.60,
    edge:  0.48,
    chase: 0.30,
    ball:  0.13,
    dirt:  0.16,
  } satisfies Record<ZoneType, number>,
}

// ============================================================
// Batted Ball Physics
// ============================================================

export const BATTED_BALL_CONFIG = {
  base_exit_velocity: 130,      // km/h
  power_slope: 0.60,            // power_factor = 0.70 + (Power/100) × 0.60  →  0.70 ~ 1.30
  quality_std_base: 0.08,       // σ = 0.08 × (1 - Contact/200)
  launch_angle_base: {
    high_zone:  5,              // 높은 존(1/2/3) → 낮은 발사각
    mid_zone:  20,
    low_zone:  35,              // 낮은 존(7/8/9) → 높은 발사각
  },
  launch_noise_base: 25,        // ° 기준 — Contact 높을수록 감소. 12→25로 상향하여 LA 분포 현실화 (ground/popup 비율 확보)
  // EV 구간 경계 (km/h) — 이하: soft / medium / hard / 초과: very_hard
  ev_tiers: { soft: 120, medium: 140, hard: 155 },
  // LA 구간 경계 (°) — 이하: ground / line_drive / fly / 초과: popup
  la_tiers: { ground: 10, line_drive: 25, fly: 45 },
}

// ============================================================
// Hit Result Table
// EV 구간 × LA 구간 → [home_run, triple, double, single, out] 가중치
// 수비 엔진 구현 시 resolveHitResult() 구현체만 교체, 이 테이블은 폐기 가능
// ============================================================

export type EVTier = 'soft' | 'medium' | 'hard' | 'very_hard'
export type LATier = 'ground' | 'line_drive' | 'fly' | 'popup'

// MLB BABIP 기준 ~.293 타겟으로 역산 설계
// EV tier 분포 (power=70 기준): soft ~0%, medium ~22%, hard ~68%, very_hard ~10%
// LA tier 분포 (noise=25° 기준): ground ~26%, line_drive ~46%, fly ~27%, popup ~6%
export const HIT_RESULT_TABLE: Record<EVTier, Record<LATier, number[]>> = {
  //                           [HR,   3B,   2B,   1B,   out ]
  soft: {
    ground:     [0,    0,    0,    0.05, 0.95],
    line_drive: [0,    0,    0,    0.15, 0.85],
    fly:        [0,    0,    0,    0.05, 0.95],
    popup:      [0,    0,    0,    0,    1.00],
  },
  medium: {
    ground:     [0,    0,    0,    0.20, 0.80],
    line_drive: [0,    0,    0.08, 0.22, 0.70],  // 30% hit
    fly:        [0,    0,    0.04, 0.03, 0.93],  //  7% hit (외야수 대부분 잡음)
    popup:      [0,    0,    0,    0,    1.00],
  },
  hard: {
    ground:     [0,    0,    0,    0.30, 0.70],
    line_drive: [0,    0.04, 0.15, 0.16, 0.65],  // 35% hit
    fly:        [0.12, 0.03, 0.10, 0.00, 0.75],  // 25% hit (HR 12% 포함)
    popup:      [0,    0,    0,    0,    1.00],
  },
  very_hard: {
    ground:     [0,    0,    0,    0.25, 0.75],
    line_drive: [0.02, 0.10, 0.36, 0.27, 0.25],  // 75% hit
    fly:        [0.45, 0.08, 0.22, 0.00, 0.25],  // 75% hit (HR 45% 포함)
    popup:      [0,    0,    0,    0.05, 0.95],
  },
}
