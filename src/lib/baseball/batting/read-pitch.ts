import type { PitchType } from '../types/player'
import type { ZoneType, PitchResult } from '../engine/types'
import type { PredictionResult } from './predict-pitch'

// ============================================================
// 투구 후 읽기 — 타자가 릴리스 후 실제 투구를 관찰·인식
//
// Eye 스탯이 높을수록:
//   - 구종 인식 정확도 ↑
//   - 코스(볼/스트라이크) 판별 정확도 ↑
// ============================================================

export interface PerceptionResult {
  perceived_type:     PitchType
  perceived_zone:     ZoneType
  perceived_zone_id:  import('../engine/types').ZoneId  // 인지된 구체적 존 ID
  type_correct:       boolean   // 구종 인식 성공 여부
  zone_correct:       boolean   // 존 인식 성공 여부
}

// 구종별 인식 난이도 — 낮을수록 인식 어려움
// 패스트볼과 유사한 arm action의 구종은 인식 어려움
const PITCH_RECOGNITION_EASE: Record<PitchType, number> = {
  fastball:  0.95,   // 직구: 거의 항상 인식
  sinker:    0.80,   // 싱커: 직구와 유사하지만 움직임 차이
  cutter:    0.60,   // 커터: 직구와 매우 유사 → 인식 어려움
  slider:    0.75,   // 슬라이더: 확연한 궤적
  curveball: 0.85,   // 커브: 명확한 회전 차이
  changeup:  0.55,   // 체인지업: 직구와 동일 arm action → 가장 어려움
  splitter:  0.50,   // 스플리터: 체인지업보다 더 기만적
  forkball:  0.60,   // 포크볼: 스플리터 유사
}

/**
 * 투구 릴리스 후 타자의 인식 과정.
 *
 * 구종 인식: Eye × 구종 인식 난이도 → 인식 확률
 *   → 실패 시 예측 구종을 그대로 유지 (오인식)
 *
 * 코스 인식: Eye 기반 → 존 인식 정확도
 *   → 실패 시 예측 존을 그대로 유지
 */
export function readPitch(
  pitch:      PitchResult,
  prediction: PredictionResult,
  eye:        number,           // 0~100, 미설정 시 50
): PerceptionResult {
  const eyeNorm = (eye ?? 50) / 100

  // ── 구종 인식 ──────────────────────────────────────────

  // 인식 확률 = Eye(0~1) × 구종 난이도(0~1)
  // Eye 100 + 쉬운 구종: 거의 100% 인식
  // Eye 30 + 어려운 구종: ~15% 인식
  const ease = PITCH_RECOGNITION_EASE[pitch.pitch_type] ?? 0.70
  const p_type_correct = eyeNorm * ease

  let perceived_type: PitchType
  let type_correct: boolean

  if (Math.random() < p_type_correct) {
    // 정확하게 인식
    perceived_type = pitch.pitch_type
    type_correct = true
  } else {
    // 오인식 → 예측했던 구종을 그대로 믿음
    perceived_type = prediction.predicted_type
    type_correct = false
  }

  // ── 코스 인식 ──────────────────────────────────────────

  // 존 인식 확률:
  //   core/ball: 인식 쉬움 (명확히 안/밖)
  //   edge/chase: 인식 어려움 (경계)
  // 존 인식 난이도 — 높을수록 정확히 인식
  // ball/dirt는 명백히 존 밖이라 Eye가 낮아도 잘 인식
  const ZONE_DIFFICULTY: Record<ZoneType, number> = {
    core:  0.90,
    edge:  0.55,
    chase: 0.45,
    ball:  0.95,
    dirt:  0.95,
  }

  const p_zone_correct = eyeNorm * ZONE_DIFFICULTY[pitch.zone_type]

  let perceived_zone: ZoneType
  let zone_correct: boolean

  if (Math.random() < p_zone_correct) {
    perceived_zone = pitch.zone_type
    zone_correct = true
  } else {
    // 오인식 → 예측했던 존을 그대로 믿음
    perceived_zone = prediction.predicted_zone
    zone_correct = false
  }

  // perceived_zone_id: 정확히 인지하면 actual_zone, 오인식이면 예측 존 ID
  const perceived_zone_id = zone_correct ? pitch.actual_zone : prediction.predicted_zone_id

  return { perceived_type, perceived_zone, perceived_zone_id, type_correct, zone_correct }
}
