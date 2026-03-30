import type { GamePitchState, PitchResult } from './types'
import { selectPitchType }   from './pitch-select'
import { decidePickoff }     from './pickoff-stub'
import { selectTargetZone }  from './zone-select'
import { applyControlScatter } from './control-scatter'
import { classifyZone }      from './zone-classify'
import { consumeStamina, checkRelief } from './stamina'
import { updateFamiliarity } from './familiarity'

// ============================================================
// M9: throwPitch — 투구 1회의 전체 흐름 통합 함수
// 순수 함수: 모든 상태 변경은 반환값으로만 전달
// ============================================================

export function throwPitch(state: GamePitchState): PitchResult {
  const {
    pitcher, batter,
    count, outs, runners,
    recent_pitches,
    remaining_stamina,
    familiarity,
    inning, is_scoring_position,
  } = state

  // 1. 구종 선택
  const pitchType = selectPitchType(
    pitcher,
    recent_pitches,
    { count, is_scoring_position }
  )

  // 2. 견제 결정 (stub — 항상 attempt: false)
  // 견제 피처 구현 시 decidePickoff 교체 및 attempt: true 분기에 PickoffResult 반환 추가
  const pickoff = decidePickoff(pitcher, runners, { count, inning })
  if (pickoff.attempt) {
    // 현재 stub이므로 이 분기에 도달하지 않음
    return undefined as never
  }

  // 3. 코스 선택 + delivery_time
  const { zone: targetZone, delivery_time } = selectTargetZone(
    pitcher,
    pitchType,
    count,
    recent_pitches
  )

  // 4. 제구 오차 + HBP 판정
  const pitchData = pitcher.pitch_types.find(pt => pt.type === pitchType)!
  const maxStamina = pitcher.stats.stamina
  const { actual_x, actual_z, actual_zone, is_hbp } = applyControlScatter(
    targetZone,
    pitchData,
    remaining_stamina,
    maxStamina,
    batter
  )

  // 5. ABS 존 판정
  const { zone_type, is_strike } = classifyZone(actual_x, actual_z, batter)

  // 6. 스태미나 소모 + 강판 체크
  const next_stamina  = consumeStamina(remaining_stamina, pitchType)
  const needs_relief  = checkRelief(next_stamina)

  // 7. 익숙함 업데이트
  const next_familiarity = updateFamiliarity(familiarity, pitchType, actual_zone)

  return {
    pitch_type:       pitchType,
    target_zone:      targetZone,
    actual_x,
    actual_z,
    actual_zone,
    zone_type,
    is_strike,
    is_hbp,
    delivery_time,
    needs_relief,
    next_stamina,
    next_familiarity,
  }
}
