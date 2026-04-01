import type { Player }     from '../types/player'
import type { PitchResult } from '../engine/types'
import type { BattingState, BattingResult } from './types'
import { decideBunt }      from './bunt-stub'
import { decideSwing }     from './swing-decision'
import { resolveContact }  from './contact'
import { calcBattedBall }  from './batted-ball'
import { resolveHitResult } from './hit-result'
import { applyPitchToCount } from './count'

// ============================================================
// hitBall — 투구 1회에 대한 타자 반응 전체 흐름 통합 함수
// 순수 함수: 모든 상태 변경은 반환값으로만 전달
// ============================================================

export function hitBall(
  state:          BattingState,
  pitch:          PitchResult,
  defenceLineup?: Player[],
): BattingResult {
  const { pitcher, batter, count, outs, runners, familiarity, inning } = state

  // 0. HBP early return — 스윙 판단 이전 처리
  if (pitch.is_hbp) {
    return {
      swing: false,
      contact: null,
      is_foul: null,
      exit_velocity: null,
      launch_angle: null,
      ...applyPitchToCount(count, 'strike', true),
    }
  }

  // 1. 번트 결정 (stub — 항상 attempt: false)
  // 번트 피처 구현 시 decideBunt 교체 및 attempt: true 분기에 BuntResult 반환 추가
  const bunt = decideBunt(batter, count, runners, { outs, inning })
  if (bunt.attempt) {
    return undefined as never
  }

  // 2. 스윙 여부
  const swing = decideSwing(batter, pitch.zone_type, count)

  if (!swing) {
    // take → 볼 or 스트라이크
    const event = pitch.is_strike ? 'strike' : 'ball'
    return {
      swing: false,
      contact: null,
      is_foul: null,
      exit_velocity: null,
      launch_angle: null,
      ...applyPitchToCount(count, event, false),
    }
  }

  // 3. 컨택 판정
  const { contact, is_fair } = resolveContact(
    pitch.zone_type,
    pitch,
    pitcher,
    batter,
    familiarity,
    count
  )

  if (!contact) {
    // 헛스윙
    return {
      swing: true,
      contact: false,
      is_foul: null,
      exit_velocity: null,
      launch_angle: null,
      ...applyPitchToCount(count, 'strike', false),
    }
  }

  // 4. 파울
  if (!is_fair) {
    return {
      swing: true,
      contact: true,
      is_foul: true,
      exit_velocity: null,
      launch_angle: null,
      ...applyPitchToCount(count, 'foul', false),
    }
  }

  // 5. 페어 컨택 품질
  const { exit_velocity, launch_angle } = calcBattedBall(pitch.zone_type, batter)

  // 6. 타구 결과
  const hit_type = resolveHitResult(exit_velocity, launch_angle, batter, defenceLineup ?? [])

  return {
    swing: true,
    contact: true,
    is_foul: false,
    exit_velocity,
    launch_angle,
    at_bat_result: hit_type,
    next_count: count,
    at_bat_over: true,
  }
}
