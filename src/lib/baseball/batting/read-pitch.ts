import type { PitchType, PitchTypeData, Player } from '../types/player'
import type { ZoneType, PitchResult } from '../engine/types'
import type { PredictionResult } from './predict-pitch'
import { classifyZone } from '../engine/zone-classify'
import { PLATE_HALF_WIDTH } from '../engine/config'
import { DECEPTION_OFFSET } from './config'

// ============================================================
// 투구 후 읽기 — 타자가 릴리스 후 실제 투구를 관찰·인식
//
// 존 인식률 = f(좌표 거리, 궤적 착각, 구속) × Eye 보정
//
// 1. 좌표 거리: 존 중심에서 멀수록 → 경계에서 최저 → 먼 바깥에서 다시 증가
// 2. 궤적 착각: 변화구 offset이 클수록 인식 난이도↑ (직구는 페널티 없음)
// 3. 구속: 빠를수록 판단 시간 부족 → 인식 난이도↑
// 4. Eye: 경계 부근에서 가장 큰 차이, 중심/먼 바깥에서는 차이 적음
//
// 인식 실패 시 — 좌표 기반 연속 착각 모델
// apparent = actual + deception_offset × factor + noise × (1 - factor)
// ============================================================

export interface PerceptionResult {
  perceived_type:     PitchType
  perceived_zone:     ZoneType
  perceived_zone_id:  import('../engine/types').ZoneId
  type_correct:       boolean
  zone_correct:       boolean
}

// 구종별 인식 난이도 — 낮을수록 인식 어려움
const PITCH_RECOGNITION_EASE: Record<PitchType, number> = {
  fastball:  0.95,
  twoseam:   0.90,
  sinker:    0.80,
  cutter:    0.60,
  slider:    0.75,
  curveball: 0.85,
  changeup:  0.55,
  splitter:  0.50,
  forkball:  0.60,
}

// 구종별 속도 지표 (패스트볼 = 1.0)
const PITCH_SPEED_INDEX: Record<string, number> = {
  fastball: 1.00, twoseam: 0.98, sinker: 0.95, cutter: 0.93,
  slider: 0.82, curveball: 0.72, changeup: 0.80, splitter: 0.83, forkball: 0.78,
}

// 인식 실패 시 좌표 노이즈 기본 σ (m)
const PERCEPTION_NOISE_STD = 0.12

// 인식 실패 시 "완전 오판" — 예측 존을 사용 (멘탈 오류)
const GROSS_MISREAD_INSIDE_K = 0.70
const GROSS_MISREAD_OUTSIDE = 0.05

function gaussianRandom(mean: number, std: number): number {
  const u1 = Math.random()
  const u2 = Math.random()
  return mean + std * Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2)
}

/**
 * 좌표 기반 착각 강도 (deception factor).
 *
 * 스트라이크존 중심으로부터의 Chebyshev 거리를 정규화.
 * 존 경계면(norm_dist=1)에서 최대, 중심과 먼 바깥에서 감소.
 */
function calcDeceptionFactor(
  actual_x: number,
  actual_z: number,
  batter: Player,
): number {
  const zone_center_z = (batter.zone_bottom + batter.zone_top) / 2
  const zone_half_h   = (batter.zone_top - batter.zone_bottom) / 2

  const norm_x = Math.abs(actual_x) / PLATE_HALF_WIDTH
  const norm_z = Math.abs(actual_z - zone_center_z) / (zone_half_h || 0.3)
  const norm_dist = Math.max(norm_x, norm_z)

  if (norm_dist <= 1) {
    return norm_dist * norm_dist
  }
  const excess = norm_dist - 1
  return Math.exp(-3 * excess * excess)
}

/**
 * 좌표 기반 존 인식률.
 *
 * 세 요소의 조합:
 * (1) 좌표 거리 — deception factor 활용 (경계에서 최저, 중심/먼바깥에서 최고)
 * (2) 궤적 착각 — 변화구 offset 크기 × ball_break (직구=0)
 * (3) 구속 — 빠를수록 판단 시간 부족
 * Eye는 경계 부근(factor 높은 곳)에서 가장 큰 보정.
 */
function calcZoneRecognition(
  actual_x: number,
  actual_z: number,
  batter: Player,
  pitchType: PitchType,
  pitchData: PitchTypeData | undefined,
  eye: number,
): number {
  const eyeNorm = eye / 100

  // 1. 좌표 거리 기반 난이도
  //    중심(factor≈0): 0.95, 경계(factor=1): 0.35, 먼바깥(factor→0): 0.95
  const factor = calcDeceptionFactor(actual_x, actual_z, batter)
  const coord_base = 0.95 - 0.60 * factor

  // Eye 보정: factor가 높을수록(경계) Eye가 더 큰 차이를 만듦
  const eye_bonus = eyeNorm * 0.25 * factor

  // 2. 궤적 착각 페널티 (변화구 offset 크기 × ball_break)
  //    직구: 0, 커브: ~0.15, 슬라이더: ~0.13
  const offset = DECEPTION_OFFSET[pitchType]
  const offset_mag = Math.sqrt(offset.dx * offset.dx + offset.dz * offset.dz)
  const break_scale = (pitchData?.ball_break ?? 50) / 100
  const trajectory_penalty = offset_mag * break_scale * 2.0

  // 3. 구속 페널티 (빠를수록 시각 처리 시간 부족)
  //    130km급 커브: ~0, 145km 평균 직구: ~0.06, 160km급 강속구: ~0.12
  const speed_idx = PITCH_SPEED_INDEX[pitchType] ?? 0.85
  const ball_speed_stat = pitchData?.ball_speed ?? 50
  const speed_factor = speed_idx * (0.8 + ball_speed_stat / 250)
  const speed_penalty = Math.max(0, speed_factor - 0.70) * 0.25

  const p = coord_base + eye_bonus - trajectory_penalty - speed_penalty
  return Math.min(0.95, Math.max(0.10, p))
}

/**
 * 착각 존 계산 — 착각 오프셋 + 인식 노이즈 통합.
 */
function calcPerceivedZone(
  pitch: PitchResult,
  pitchData: PitchTypeData | undefined,
  pitcherThrows: 'L' | 'R',
  batter: Player,
  factor: number,
): { zone_type: ZoneType; zone_id: import('../engine/types').ZoneId } {
  const offset = DECEPTION_OFFSET[pitch.pitch_type]
  const breakScale = (pitchData?.ball_break ?? 50) / 100

  let dx_deception = offset.dx * breakScale * factor
  const dz_deception = offset.dz * breakScale * factor
  if (pitcherThrows === 'L') dx_deception = -dx_deception

  const noise_std = PERCEPTION_NOISE_STD * (1 - factor)
  const dx_noise = gaussianRandom(0, noise_std)
  const dz_noise = gaussianRandom(0, noise_std)

  const apparent_x = pitch.actual_x + dx_deception + dx_noise
  const apparent_z = pitch.actual_z + dz_deception + dz_noise

  const result = classifyZone(apparent_x, apparent_z, batter)
  return { zone_type: result.zone_type, zone_id: result.zone_id }
}

/**
 * 투구 릴리스 후 타자의 인식 과정.
 */
export function readPitch(
  pitch:          PitchResult,
  prediction:     PredictionResult,
  eye:            number,
  pitchData?:     PitchTypeData,
  pitcherThrows?: 'L' | 'R',
  batter?:        Player,
): PerceptionResult {
  const eyeNorm = (eye ?? 50) / 100

  // ── 구종 인식 ──────────────────────────────────────────

  const ease = PITCH_RECOGNITION_EASE[pitch.pitch_type] ?? 0.70
  const p_type_correct = eyeNorm * ease

  let perceived_type: PitchType
  let type_correct: boolean

  if (Math.random() < p_type_correct) {
    perceived_type = pitch.pitch_type
    type_correct = true
  } else {
    perceived_type = prediction.predicted_type
    type_correct = false
  }

  // ── 코스 인식 ──────────────────────────────────────────

  // 좌표 기반 인식률 (batter + pitchData 있을 때) or 간이 fallback
  let p_zone_correct: number
  if (batter && pitchData) {
    p_zone_correct = calcZoneRecognition(
      pitch.actual_x, pitch.actual_z, batter,
      pitch.pitch_type, pitchData, eye,
    )
  } else {
    // fallback: 간이 존 타입 기반
    const ZONE_FALLBACK: Record<ZoneType, number> = {
      core: 0.80, mid: 0.70, edge: 0.45, chase: 0.35, ball: 0.80,
    }
    p_zone_correct = Math.min(0.95, ZONE_FALLBACK[pitch.zone_type] * (0.7 + eyeNorm * 0.3))
  }

  let perceived_zone: ZoneType
  let perceived_zone_id: import('../engine/types').ZoneId
  let zone_correct: boolean

  if (Math.random() < p_zone_correct) {
    perceived_zone = pitch.zone_type
    perceived_zone_id = pitch.actual_zone
    zone_correct = true
  } else {
    zone_correct = false

    if (pitchData && pitcherThrows && batter) {
      const factor = calcDeceptionFactor(pitch.actual_x, pitch.actual_z, batter)

      const zone_center_z = (batter.zone_bottom + batter.zone_top) / 2
      const zone_half_h = (batter.zone_top - batter.zone_bottom) / 2
      const norm_x = Math.abs(pitch.actual_x) / PLATE_HALF_WIDTH
      const norm_z = Math.abs(pitch.actual_z - zone_center_z) / (zone_half_h || 0.3)
      const norm_dist = Math.max(norm_x, norm_z)

      const gross_misread = norm_dist <= 1
        ? Math.max(1.0 - factor * 0.7, GROSS_MISREAD_OUTSIDE)
        : GROSS_MISREAD_OUTSIDE

      if (Math.random() < gross_misread) {
        perceived_zone = prediction.predicted_zone
        perceived_zone_id = prediction.predicted_zone_id
      } else {
        const perceived = calcPerceivedZone(pitch, pitchData, pitcherThrows, batter, factor)
        perceived_zone = perceived.zone_type
        perceived_zone_id = perceived.zone_id
      }
    } else {
      perceived_zone = prediction.predicted_zone
      perceived_zone_id = prediction.predicted_zone_id
    }
  }

  return { perceived_type, perceived_zone, perceived_zone_id, type_correct, zone_correct }
}
