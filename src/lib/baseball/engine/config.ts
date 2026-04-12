import type { PitchType } from '../types/player'
import type { ZoneId } from './types'

// ============================================================
// Pitch Selection
// ============================================================

export const PITCH_SELECT_CONFIG = {
  k:     0.6,   // 반복 패널티 강도
  N:     5,     // 반복 판단 윈도우 (최근 N구)
  boost: 1.5,   // 위기 상황 주무기 보정
}

// ============================================================
// Stamina
// ============================================================

export const STAMINA_CONFIG = {
  fatigue_per_pitch:   0.7,
  pitch_type_modifier: {
    fastball:  1.0,
    twoseam:   1.0,
    sinker:    1.0,
    cutter:    1.0,
    slider:    1.1,   // breaking
    curveball: 1.1,
    changeup:  0.9,   // off_speed
    splitter:  0.9,
    forkball:  0.9,
  } satisfies Record<PitchType, number>,
  relief_threshold: 20,
}

// ============================================================
// Control Scatter
// ============================================================

// v2: 가우시안 제구 모델 — σ = f(BallControl)
export const SCATTER_CONFIG = {
  sigma_min:    0.03,  // Control 100일 때 σ (m) — 타이트한 제구
  sigma_max:    0.12,  // Control 0일 때 σ (m) — chase 흡수 감소 + strike% 향상
  axis_ratio:   0.7,   // σ_z / σ_x 비율 (수직이 약간 더 넓음)
  fatigue_mult: 0.5,   // 스태미나 소진 시 σ 증가 배수
}

// ============================================================
// Zone Geometry
// ============================================================

// 투수판 → 홈플레이트 거리
export const BASE_DISTANCE = 18.44  // m
// 구속 100 기준 최대 속도 (180 km/h ≈ 50 m/s)
export const MAX_SPEED = 50         // m/s

// 우타자 기준 몸통 영역 (좌타자는 x 부호 반전)
// x_max=-0.68: X_LEFT_BALL=-0.58과 분리 → 최소 0.10m 여백, HBP는 큰 제구 오차 시만 발생
// z: 무릎~어깨 (0.45~1.55m), MLB HBP ~1% 기준 역산
export const BATTER_BODY = {
  x_min: -1.05, x_max: -0.50,
  z_min:  0.45, z_max:  1.55,
  y_min: -0.10, y_max:  0.50,
}

// ABS 확장 스트라이크 존 여유 (m)
export const ABS_MARGIN_X = 0.2525   // ±25.25 cm
export const ABS_MARGIN_Z = 0.0365   // ±3.65 cm

// 스트라이크 존 경계: x는 홈플레이트 폭 기준 (±21.59 cm = ±0.2159 m, 반폭)
export const PLATE_HALF_WIDTH = 0.2159  // m

// ============================================================
// Familiarity
// ============================================================

export const FAMILIARITY_DECAY = 0.2   // 타석 종료 시 잔존율
export const FAMILIARITY_INC   = 0.1   // 투구 1회당 증가량

// ============================================================
// Pitch Affinity (구종×존 궁합)
// 선호 존: 2.0, 준선호 존: 1.5, 기본: 1.0 (미정의 시 1.0)
// ============================================================

// v2: 구종별 chase/ball 존 의도적 타겟팅 포함
// 변화구는 존 밖이 "목표"인 경우가 많음 (유인구)
// 7×7 그리드: Z{row}{col}, chase=1칸 인접, ball=2칸+
export const PITCH_AFFINITY: Record<PitchType, Partial<Record<ZoneId, number>>> = {
  fastball:  { 1: 2.0, 2: 2.0, 3: 2.0, 4: 1.5, 6: 1.5, Z12: 1.3, Z13: 1.3, Z14: 1.3 },
  // 투심: 4심과 싱커 중간 — 낮은 존 살짝 선호, 약한 무브먼트
  twoseam:   { 4: 1.8, 6: 1.8, 7: 1.8, 8: 1.8, 9: 1.8, Z41: 1.3, Z52: 1.3 },
  sinker:    { 7: 2.0, 8: 2.0, 9: 2.0, Z41: 1.5, Z52: 2.0, Z53: 1.5 },
  cutter:    { 3: 2.0, 6: 2.0, 9: 2.0, Z25: 2.0, Z35: 1.5 },
  slider:    { 3: 2.0, 6: 2.0, 9: 2.0, Z25: 2.5, Z35: 2.5, Z45: 2.5 },   // 아웃코스 chase 유인
  curveball: { 7: 2.0, 8: 2.0, 9: 2.0, Z52: 2.0, Z53: 2.5, Z54: 2.0 },   // 하단 chase 유인
  changeup:  { 7: 1.5, 8: 2.0, 9: 1.5, Z53: 2.0, Z54: 1.5, Z52: 1.5 },   // 낮은 존 + chase
  splitter:  { 8: 2.0, 9: 1.5, Z52: 2.0, Z53: 2.5, Z54: 2.0 },           // 하단 chase 중심
  forkball:  { 8: 2.0, Z52: 2.0, Z53: 2.5, Z54: 2.0, Z55: 1.5 },         // 하단 chase 중심
}

// ============================================================
// Zone Select — 스트라이크 존 기본 가중치 보정
// 스트라이크 9개 vs 볼 16개 → 기본 가중치 1:1이면 strike%≈36%
// 2.3× 보정 시 strike%≈62% (MLB ~62%)
// ============================================================

// 7×7 그리드 + 순수 좌표 스트라이크: 산포 손실 보상용 높은 가중치
// 9×14 = 126, 16 chase×1.3 = 20.8, 24 ball×1.0 = 24 → 타겟팅 ~74%
// 실제 strike%: 타겟팅 74% × 산포 유지율 ~70% ≈ 52%
export const ZONE_SELECT_STRIKE_BASE = 10.0

// core(한복판) 페널티: 투수는 한복판을 피하고 코너를 노림
// core 가중치 = STRIKE_BASE × CORE_PENALTY = 6.0 × 0.35 = 2.1
// edge 가중치 = STRIKE_BASE = 6.0 (기본)
// → edge:core ≈ 2.9:1 비율
export const ZONE_SELECT_CORE_PENALTY = 0.35

// chase(경계 밖 볼존) 보너스: 미끼구/낭비구용
// chase 가중치 = 1.0 × 1.5 = 1.5 (볼존 기본 1.0 대비)
// 7×7: 16개 chase 존 (기존 6개 대비 2.7배) → 개별 보너스 축소
export const ZONE_SELECT_CHASE_BONUS = 1.3

// ============================================================
// Count State — 카운트 분류 (pitcher-ai에서 사용)
// ============================================================

export type CountState = 'ahead' | 'neutral' | 'behind' | 'full'

export function classifyCount(balls: number, strikes: number): CountState {
  if (balls === 3 && strikes === 2) return 'full'
  if (strikes === 2 && balls <= 1) return 'ahead'
  if (strikes >= 1 && balls === 0) return 'ahead'   // 0-1
  if (balls === 3) return 'behind'                  // 3-0, 3-1
  if (balls >= 2 && strikes <= 1) return 'behind'   // 2-0, 2-1
  return 'neutral'                                   // 0-0, 1-0, 1-1, 2-2
}

export type ZoneCategory = 'core' | 'mid' | 'edge' | 'chase' | 'ball'

// ============================================================
// Step 5 — 목표 기반 투수 AI 타입 및 설정
// ============================================================

export type PitcherGoal = 'strikeout' | 'strike_first' | 'weak_contact' | 'safe_strike' | 'explore'

export type Approach =
  | 'high_heat'          // 상단 패스트볼로 밀어붙이기
  | 'chase_break'        // chase 브레이킹볼 유인
  | 'paint_corner'       // edge 코너 정밀 공략
  | 'surprise_zone'      // 존 안 기습 (빠른 공 or 가장 브레이킹)
  | 'mid_strike'         // mid/core 안전한 스트라이크
  | 'sequence_opposite'  // 이전 투구 반대 방향
  | 'mix_speed'          // 속도 차 활용 (빠른↔느린)
  | 'low_zone'           // 낮은 존 집중 (땅볼/약한 타구)

export type SpeedTier = 'fast' | 'breaking' | 'offspeed'

export const PITCH_SPEED_TIER: Record<PitchType, SpeedTier> = {
  fastball: 'fast', twoseam: 'fast', sinker: 'fast', cutter: 'fast',
  slider: 'breaking', curveball: 'breaking',
  changeup: 'offspeed', splitter: 'offspeed', forkball: 'offspeed',
}

// ---- 투수 AI 기본 파라미터 ----

export const PITCHER_AI_CONFIG = {
  weak_contact_power_threshold: 65,   // 이 이상이면 강타자 → weak_contact goal
  gidp_low_bonus:  1.3,              // 병살 가능 → low_zone/chase 보너스
  tagup_low_bonus: 1.3,              // 태그업 위험 → low_zone 보너스
  tagup_high_penalty: 0.7,           // 태그업 위험 → 높은 존 억제
}

// ---- Goal → Approach 선택 가중치 ----
// base: 기본 선택 확률, tendency: 투수 성향 키, bonus: 성향 보너스 배수

export interface ApproachWeightEntry {
  base: number
  tendency: 'precision' | 'power_style' | 'movement' | 'velocity' | 'deception'
  bonus: number
}

export const GOAL_APPROACH_WEIGHTS: Record<PitcherGoal, Partial<Record<Approach, ApproachWeightEntry>>> = {
  strikeout: {
    high_heat:     { base: 0.20, tendency: 'velocity',  bonus: 0.25 },
    chase_break:   { base: 0.30, tendency: 'movement',  bonus: 0.25 },
    paint_corner:  { base: 0.20, tendency: 'precision', bonus: 0.25 },
    surprise_zone: { base: 0.10, tendency: 'deception', bonus: 0.15 },
    low_zone:      { base: 0.10, tendency: 'movement',  bonus: 0.10 },
    mix_speed:     { base: 0.10, tendency: 'deception', bonus: 0.15 },
  },
  strike_first: {
    paint_corner:  { base: 0.35, tendency: 'precision',   bonus: 0.25 },
    mid_strike:    { base: 0.30, tendency: 'power_style', bonus: 0.20 },
    high_heat:     { base: 0.20, tendency: 'velocity',    bonus: 0.15 },
    surprise_zone: { base: 0.15, tendency: 'deception',   bonus: 0.10 },
  },
  explore: {
    sequence_opposite: { base: 0.30, tendency: 'precision', bonus: 0.15 },
    mix_speed:         { base: 0.25, tendency: 'deception', bonus: 0.20 },
    paint_corner:      { base: 0.25, tendency: 'precision', bonus: 0.15 },
    chase_break:       { base: 0.10, tendency: 'movement',  bonus: 0.15 },
    high_heat:         { base: 0.10, tendency: 'velocity',  bonus: 0.10 },
  },
  safe_strike: {
    mid_strike:    { base: 0.45, tendency: 'power_style', bonus: 0.15 },
    paint_corner:  { base: 0.35, tendency: 'precision',   bonus: 0.25 },
    high_heat:     { base: 0.10, tendency: 'velocity',    bonus: 0.10 },
    surprise_zone: { base: 0.10, tendency: 'power_style', bonus: 0.05 },
  },
  weak_contact: {
    low_zone:      { base: 0.35, tendency: 'movement',  bonus: 0.20 },
    chase_break:   { base: 0.25, tendency: 'movement',  bonus: 0.20 },
    paint_corner:  { base: 0.25, tendency: 'precision', bonus: 0.20 },
    mix_speed:     { base: 0.15, tendency: 'deception', bonus: 0.10 },
  },
}

// ---- Approach → Zone Category 가중치 ----

// 기존 COUNT_STATE_BIAS × PITCH_STRATEGY combined 범위: 0.7~1.35
// approach는 이 두 레이어를 대체 — 범위를 0.80~1.35로 제한
// approach가 "의도적 경향"이지 볼존 완전 차단이 아님
export const APPROACH_ZONE_BIAS: Record<Approach, Partial<Record<ZoneCategory, number>>> = {
  high_heat:         { core: 1.05, mid: 1.10, edge: 0.95, chase: 0.85, ball: 0.80 },
  chase_break:       { chase: 1.35, edge: 0.95, mid: 0.85, core: 0.80, ball: 0.90 },
  paint_corner:      { edge: 1.25, mid: 1.00, chase: 0.95, core: 0.80, ball: 0.85 },
  surprise_zone:     { core: 1.15, mid: 1.10, edge: 0.90, chase: 0.85, ball: 0.80 },
  mid_strike:        { mid: 1.15, core: 1.05, edge: 0.95, chase: 0.85, ball: 0.80 },
  sequence_opposite: { edge: 1.10, mid: 1.05, chase: 1.00, core: 0.90, ball: 0.85 },
  mix_speed:         { edge: 1.05, mid: 1.05, chase: 1.00, core: 0.90, ball: 0.85 },
  low_zone:          { chase: 1.20, edge: 1.05, mid: 0.90, core: 0.80, ball: 1.10 },
}

// ---- Approach → 방향 가중치 (high/low/inside/outside) ----

export const APPROACH_DIRECTION_BIAS: Record<Approach, { high?: number; low?: number; inside?: number; outside?: number }> = {
  high_heat:         { high: 1.5, low: 0.7 },
  chase_break:       {},
  paint_corner:      {},
  surprise_zone:     {},
  mid_strike:        {},
  sequence_opposite: {},  // 동적으로 이전 투구에서 계산
  mix_speed:         {},
  low_zone:          { low: 1.5, high: 0.6 },
}

// ---- Approach → 구종 속도 계열 선호도 ----

export const APPROACH_PITCH_PREF: Record<Approach, Partial<Record<SpeedTier, number>>> = {
  high_heat:         { fast: 1.5, breaking: 0.6, offspeed: 0.5 },
  chase_break:       { breaking: 1.5, offspeed: 1.3, fast: 0.6 },
  paint_corner:      { fast: 1.1, breaking: 1.1, offspeed: 0.9 },
  surprise_zone:     { fast: 1.3, offspeed: 1.2, breaking: 0.8 },
  mid_strike:        { fast: 1.3, breaking: 0.9, offspeed: 1.0 },
  sequence_opposite: { fast: 1.0, breaking: 1.0, offspeed: 1.0 },
  mix_speed:         { offspeed: 1.4, breaking: 1.2, fast: 0.7 },   // 동적으로 이전 구종에서 보정
  low_zone:          { breaking: 1.2, offspeed: 1.3, fast: 0.8 },
}

// ============================================================
// Phase 2 — 3-0 구위 트레이드오프 (Step 9)
// 3-0 카운트에서 직구 계열 강제 + 타겟 좌표에서 P(strike) ≥ target_prob
// 이 되는 최소 k(σ/ball_power 감쇠 계수)를 이진탐색
// ============================================================

export const POWER_TRADEOFF_CONFIG = {
  target_strike_prob: 0.9,   // P(strike) 목표 임계값
  binary_search_iter: 10,    // 이진탐색 반복 (정밀도 ~0.001)
  k_min:              0.01,  // 이진탐색 하한 (이론상; 실무상 도달 거의 불가)
  // 직구 계열 우선순위 — 앞부터 첫 보유 구종 사용
  fastball_priority: ['fastball', 'twoseam', 'sinker', 'cutter'] as const,
}

// ============================================================
// Phase 2 — 타자 Power 기반 조심도 (Step 8)
// Carry = batter.power - pitch.ball_power
// 그래프형 조각 선형 (piecewise linear)
// ============================================================

export const POWER_CAUTION = {
  // 조각별 break point: [carry, caution]
  // carry ≤ -20 → 0.0 (정상)
  // carry  =   0 → 0.3 (약간 조심)
  // carry  = +20 → 0.7 (매우 조심)
  // carry ≥ +40 → 1.0 (최대 조심)
  breakpoints: [
    { carry: -20, caution: 0.0 },
    { carry:   0, caution: 0.3 },
    { carry:  20, caution: 0.7 },
    { carry:  40, caution: 1.0 },
  ],
  // 조심도 적용 강도 (존 카테고리별)
  // caution=1 기준, 곱셈 보정: 1 + (coefficient × caution)
  zone_effect: {
    high_avoid:  -0.5,  // HIGH_ZONES: 최대 -50%
    core_avoid:  -0.6,  // CORE_ZONES: 최대 -60% (추가)
    mid_avoid:   -0.3,  // MID_ZONES : 최대 -30%
    low_prefer:  +0.3,  // LOW_ZONES : 최대 +30%
  },
}

// ============================================================
// Sequence Modifier (전구 코스 기반 위치 변화 선호)
// ============================================================

export const SEQUENCE_MODIFIER = {
  prev_inside_to_outside: 1.4,
  prev_outside_to_inside: 1.4,
  prev_high_to_low:       1.3,
  prev_low_to_high:       1.3,
}
