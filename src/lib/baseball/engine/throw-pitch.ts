import type { PitchType } from '../types/player'
import type { GamePitchState, PitchResult } from './types'
import { selectPitchType }   from './pitch-select'
import { selectTargetZone }  from './zone-select'
import { applyControlScatter, computeBaseSigma, pickTargetCoords } from './control-scatter'
import { classifyZone }      from './zone-classify'
import { consumeStamina, checkRelief } from './stamina'
import { updateFamiliarity } from './familiarity'
import { findMinimalPowerReduction } from './power-tradeoff'
import { derivePitcherTendency, decidePitcherGoal, selectApproach } from './pitcher-ai'
import { POWER_TRADEOFF_CONFIG } from './config'

// ============================================================
// M9: throwPitch — 투구 1회의 전체 흐름 통합 함수
// 순수 함수: 모든 상태 변경은 반환값으로만 전달
// ============================================================

// Step 9 — 3-0에서 보유한 직구 계열 중 우선순위 첫 구종 반환
function pickFastballFamily(pitcher: GamePitchState['pitcher']): PitchType | null {
  const owned = new Set(pitcher.pitch_types.map(pt => pt.type))
  for (const type of POWER_TRADEOFF_CONFIG.fastball_priority) {
    if (owned.has(type)) return type
  }
  return null
}

export function throwPitch(state: GamePitchState): PitchResult {
  const {
    pitcher, batter,
    count, outs, runners,
    recent_pitches,
    remaining_stamina,
    familiarity,
    is_scoring_position,
  } = state

  // ---- Step 9: 특수 카운트 판정 ----
  const basesLoaded = runners.first && runners.second && runners.third
  const isThreeZero = count.balls === 3 && count.strikes === 0
  const isThreeXLoaded =
    count.balls === 3 && count.strikes >= 1 && basesLoaded
  const strikeZoneOnly = isThreeZero || isThreeXLoaded

  // ---- Step 5: 투수 AI — goal → approach ----
  const tendency = derivePitcherTendency(pitcher)
  const goal = decidePitcherGoal(count, outs, runners, batter)
  const situationMods = {
    gidpPossible: runners.first && outs < 2,
    tagUpRisk:    runners.third && outs < 2,
  }
  const approach = selectApproach(goal, tendency, recent_pitches, situationMods)

  // 1. 구종 선택 (3-0 → 직구 계열 강제, 그 외 → approach 기반)
  let pitchType: PitchType
  if (isThreeZero) {
    pitchType = pickFastballFamily(pitcher) ?? selectPitchType(
      pitcher, recent_pitches, { count, is_scoring_position }, approach
    )
  } else {
    pitchType = selectPitchType(
      pitcher, recent_pitches, { count, is_scoring_position }, approach
    )
  }

  // 2. 코스 선택 + delivery_time (approach bias 적용)
  const { zone: targetZone, delivery_time } = selectTargetZone(
    pitcher,
    pitchType,
    batter,
    recent_pitches,
    approach,
    { strikeZoneOnly, threeZeroBias: isThreeZero },
  )

  // 3. pitchData & σ 준비
  const pitchData = pitcher.pitch_types.find(pt => pt.type === pitchType)!
  const maxStamina = pitcher.stats.stamina
  const baseSigma = computeBaseSigma(pitchData, remaining_stamina, maxStamina)

  // 4. Step 9 — 3-0 구위 트레이드오프
  // 타겟 좌표 사전 선택 → k 이진탐색 → σ/ball_power 스케일 결정
  let sigmaScale = 1.0
  let effective_ball_power: number | undefined = undefined
  const target = pickTargetCoords(targetZone, batter)

  if (isThreeZero) {
    const { k } = findMinimalPowerReduction(
      target.x,
      target.z,
      baseSigma.sigma_x,
      baseSigma.sigma_z,
      batter,
    )
    sigmaScale = k
    if (k < 1.0) {
      effective_ball_power = pitchData.ball_power * k
    }
  }

  // 5. 제구 오차 + HBP 판정
  const { actual_x, actual_z, actual_zone, is_hbp } = applyControlScatter(
    targetZone,
    pitchData,
    remaining_stamina,
    maxStamina,
    batter,
    { target, sigmaScale },
  )

  // 6. ABS 존 판정
  const { zone_type, is_strike } = classifyZone(actual_x, actual_z, batter)

  // 7. 스태미나 소모 + 강판 체크
  const next_stamina  = consumeStamina(remaining_stamina, pitchType)
  const needs_relief  = checkRelief(next_stamina)

  // 8. 익숙함 업데이트
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
    effective_ball_power,
  }
}
