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
  eye_default: 60,  // Eye 스탯 미설정 시 기본값 — 50→60: 볼존 인식 + K% 밸런스

  // ── v2 스윙 결정 ──────────────────────────────────────
  // 카운트 압박 테이블: 카운트별 기본 스윙 경향 (스탯 보정 전)
  // MLB 실측: 초구 ~28%, 0-2 ~52%, 3-0 ~20%
  count_pressure: {
    '0-0': 0.30,
    '0-1': 0.35,
    '0-2': 0.55,
    '1-0': 0.32,
    '1-1': 0.38,
    '1-2': 0.52,
    '2-0': 0.28,
    '2-1': 0.35,
    '2-2': 0.48,
    '3-0': 0.18,
    '3-1': 0.25,
    '3-2': 0.45,
  } as Record<string, number>,

  // 스탯 스케일링 비율
  contact_swing_scale: 0.25,   // Contact가 스윙 경향에 미치는 영향 (0~+0.25)
  eye_take_scale:      0.20,   // Eye가 볼에서 스윙 억제에 미치는 영향 (0~-0.20)

  // 구종 속도 계열 분류
  pitch_speed_tier: {
    fastball:  'fast',
    sinker:    'fast',
    cutter:    'fast',
    slider:    'breaking',
    curveball: 'breaking',
    changeup:  'offspeed',
    splitter:  'offspeed',
    forkball:  'offspeed',
  } as Record<string, 'fast' | 'breaking' | 'offspeed'>,

  // 속도 계열 유사성 (예측 계열 vs 실제 계열)
  speed_tier_similarity: {
    'fast-fast':         1.0,   // 동일 계열
    'breaking-breaking': 1.0,
    'offspeed-offspeed': 1.0,
    'fast-offspeed':     0.5,   // 타이밍 차이 큼
    'offspeed-fast':     0.5,
    'fast-breaking':     0.4,   // 타이밍 차이 매우 큼
    'breaking-fast':     0.4,
    'breaking-offspeed': 0.8,   // 비교적 유사
    'offspeed-breaking': 0.8,
  } as Record<string, number>,
}

// ============================================================
// Contact
// ============================================================

export const CONTACT_CONFIG = {
  // base_contact = intercept + (Contact/100) × slope
  // MLB 컨택률: 스트라이크 존 ~80%, 체이스 ~55%
  // 헛스윙 과다 문제 해결: core/edge intercept 상향, pitch_modifier_max 인하
  base_contact: {
    core:  { intercept: 0.65, slope: 0.30 },  // 0.65 ~ 0.95
    edge:  { intercept: 0.52, slope: 0.28 },  // 0.52 ~ 0.80
    chase: { intercept: 0.32, slope: 0.23 },  // 0.32 ~ 0.55
    ball:  { intercept: 0.18, slope: 0.18 },  // 0.18 ~ 0.36
    dirt:  { intercept: 0.15, slope: 0.18 },  // 0.15 ~ 0.33
  } satisfies Record<ZoneType, { intercept: number; slope: number }>,
  pitch_modifier_max: 0.18,      // 구종 난이도 최대 페널티 (0.30→0.18 인하: 헛스윙 과다 방지)
  familiarity_bonus_max: 0.15,   // familiarity 최대 보너스 +15%
  // 2-스트라이크 컨택 보너스: 타자가 배트를 짧게 잡고 플레이트를 보호하는 현실 반영
  // 이 보너스로 2스트라이크 헛스윙 감소 → K% 하향 → MLB 수준에 근접
  two_strike_contact_bonus: 0.20,
  // 컨택 성공 시 페어 확률 (v1 fallback + selectDirectionAngle에서 사용)
  fair_prob: {
    core:  0.60,
    edge:  0.48,
    chase: 0.30,
    ball:  0.13,
    dirt:  0.16,
  } satisfies Record<ZoneType, number>,

  // v2 컨택 오프셋 계수 (BATTED_BALL_CONFIG.v2에서도 참조)
  v2: {
    timing_noise_std_base:  0.08,
    center_noise_std_base:  0.10,
    zone_error_penalty:     0.15,
  },
}

// ============================================================
// Batted Ball Physics
// ============================================================

export const BATTED_BALL_CONFIG = {
  base_exit_velocity: 148,      // km/h
  power_slope: 0.75,            // power_factor = 0.70 + (Power/100) × 0.75  →  0.70 ~ 1.45
  quality_std_base: 0.08,       // σ = 0.08 × (1 - Contact/200)
  launch_angle_base: {
    high_zone:  5,              // dirt 전용 (현재 low_zone 상수로 사용)
    mid_zone:  20,              // 미사용 (mixture로 대체)
    low_zone:   2,              // dirt 공 기본 발사각
  },
  launch_noise_base: 25,        // dirt 이외 미사용 (mixture 각 성분이 자체 σ 사용)
  // ── 두 성분 혼합 발사각 분포 (MLB 캘리브레이션) ──────────────
  // 목표: ground ~41% / LD ~23% / fly ~29% / popup ~7%
  // 검증: 0.45×N(0,10) + 0.55×N(30,13)
  //   ground(<10°): 0.45×84% + 0.55×6%  = 41%
  //   LD(10~25°):   0.45×15% + 0.55×29% = 23%
  //   fly(25~45°):  0.45×1%  + 0.55×52% = 29%
  //   popup(>45°):  0.45×0%  + 0.55×13% = 7%
  mixture_grounder_weight: 0.45,  // 땅볼 성분 비율
  mixture_grounder_mean:   0,     // °
  mixture_grounder_std:    10,    // °
  mixture_fly_mean:        30,    // °
  mixture_fly_std:         13,    // °
  // EV 구간 경계 (km/h) — 이하: soft / medium / hard / 초과: very_hard
  ev_tiers: { soft: 120, medium: 140, hard: 155 },
  // LA 구간 경계 (°) — 이하: ground / line_drive / fly / 초과: popup
  la_tiers: { ground: 10, line_drive: 25, fly: 45 },

  // ── v2 통합 모델 계수 ──────────────────────────────────
  v2: {
    // EV 계수
    power_advantage_scale:  0.10,   // Power vs BallPower 매치업 보정 (±10%)
    pitch_speed_ev_base:    0.85,   // 투구 속도가 EV에 미치는 기본값
    pitch_speed_ev_scale:   0.15,   // 투구 속도 추가 비례분
    center_penalty_k:       2.5,    // center_offset → EV 페널티 민감도 (1.5→2.5: 가파른 EV 감소)
    center_penalty_max:     0.60,   // EV 최대 감소 비율 (60%) — 빗맞으면 급감, 정타면 최대
    timing_penalty_k:       1.5,    // timing_offset → EV 페널티 민감도 (2.0→1.5)
    timing_penalty_max:     0.25,   // EV 최대 감소 비율 (25%)
    min_ev:                 40,     // EV 하한 (km/h)

    // LA 계수
    base_la:                14,     // 정중앙 기본 발사각 (°) — 12→14: fly ball 비율↑
    center_to_la_k:         100,    // center_offset → LA 변환 계수 (120→100)
    la_noise_std:           10,     // LA 자연 분산 (°) — 6→10: 더 넓은 LA 분포

    // 방향각 (θ) 계수
    timing_to_theta_k:      150,    // timing_offset → θ 변환 계수
    center_instability_k:   15,     // center_offset → θ 노이즈 추가 계수
    theta_base_noise_std:   10,     // θ 기본 노이즈 (°) — 배트 각도 자연 분산 (프로 타자 기준)

    // 컨택 오프셋 계수
    timing_noise_std_base:  0.08,   // timing_offset 기본 노이즈 σ
    center_noise_std_base:  0.28,   // center_offset 기본 노이즈 σ (0.18→0.28: 약한 타구↑, EV 분포 확대)
    zone_error_penalty:     0.15,   // 존 오인식 시 center_offset 추가 σ
  },
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
