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
  sigma_min:    0.05,  // Control 100일 때 σ (m) — 극히 드문 실수만
  sigma_max:    0.20,  // Control 0일 때 σ (m) — 넓게 퍼지지만 HBP 과다 방지
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
  x_min: -1.05, x_max: -0.75,
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

// v2: 구종별 ball/dirt 존 의도적 타겟팅 포함
// 변화구는 존 밖이 "목표"인 경우가 많음 (유인구)
export const PITCH_AFFINITY: Record<PitchType, Partial<Record<ZoneId, number>>> = {
  fastball:  { 1: 2.0, 2: 2.0, 3: 2.0, 4: 1.5, 6: 1.5, B12: 1.3, B13: 1.3, B14: 1.3 },
  sinker:    { 7: 2.0, 8: 2.0, 9: 2.0, B25: 1.5, B32: 2.0, B33: 1.5 },
  cutter:    { 3: 2.0, 6: 2.0, 9: 2.0, B22: 2.0, B24: 1.5 },
  slider:    { 3: 2.0, 6: 2.0, 9: 2.0, B22: 2.5, B24: 2.5, B26: 2.5 },   // 아웃코스 볼존 유인
  curveball: { 7: 2.0, 8: 2.0, 9: 2.0, B32: 2.0, B33: 2.5, B34: 2.0 },   // dirt 유인
  changeup:  { 7: 1.5, 8: 2.0, 9: 1.5, B33: 2.0, B34: 1.5, B32: 1.5 },   // 낮은 존 + dirt
  splitter:  { 8: 2.0, 9: 1.5, B32: 2.0, B33: 2.5, B34: 2.0 },           // dirt 중심
  forkball:  { 8: 2.0, B32: 2.0, B33: 2.5, B34: 2.0, B35: 1.5 },         // dirt 중심
}

// ============================================================
// Zone Select — 스트라이크 존 기본 가중치 보정
// 스트라이크 9개 vs 볼 16개 → 기본 가중치 1:1이면 strike%≈36%
// 2.3× 보정 시 strike%≈62% (MLB ~62%)
// ============================================================

// 2.3 → 2.1: BB% 보정 (스트라이크 비율 약간 낮춰 볼넷 증가)
export const ZONE_SELECT_STRIKE_BASE = 2.1

// core(한복판) 페널티: 투수는 한복판을 피하고 코너를 노림
// core 가중치 = STRIKE_BASE × CORE_PENALTY = 2.1 × 0.4 = 0.84
// edge 가중치 = STRIKE_BASE = 2.1 (기본)
// → edge:core ≈ 2.5:1 비율
export const ZONE_SELECT_CORE_PENALTY = 0.25  // 0.4→0.25: core 비율 추가 감소

// chase(경계 밖 볼존) 보너스: 미끼구/낭비구용
// chase 가중치 = 1.0 × 1.5 = 1.5 (볼존 기본 1.0 대비)
export const ZONE_SELECT_CHASE_BONUS = 2.0  // 1.5→2.0: chase/유인구 비중 증가

// ============================================================
// Count Modifier
// ============================================================

// behind_3balls: 3볼 카운트에서 ball_zones 1.0 (중립) → 자연스러운 볼넷 비율 유도
export const COUNT_MODIFIER = {
  behind_3balls: { strike_zones: 1.0, ball_zones: 1.0 },
  ahead_0_2:     { natural_fall: 1.6, dirt: 1.4 },
  ahead_1_2:     { natural_fall: 1.6, dirt: 1.4 },
  first_pitch:   {},
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
