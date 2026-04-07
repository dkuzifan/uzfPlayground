import type { Player }     from '../types/player'
import type { PitchResult } from '../engine/types'
import type { BattingState, BattingResult } from './types'
import { decideBunt }      from './bunt-stub'
import { decideSwing }     from './swing-decision'
import { resolveContact }  from './contact'
import { calcBattedBall }  from './batted-ball'
import { resolveHitResult, resolveFoulCatchable } from './hit-result'
import { applyPitchToCount } from './count'
import { selectDirectionAngle, classifyTerritory } from '../defence/ball-physics'
import { PHYSICS_CONFIG } from '../defence/config'

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
  const bunt = decideBunt(batter, count, runners, { outs, inning })
  if (bunt.attempt) {
    return undefined as never
  }

  // 2. 스윙 여부
  const swing = decideSwing(batter, pitch.zone_type, count)

  if (!swing) {
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
  const { contact } = resolveContact(
    pitch.zone_type,
    pitch,
    pitcher,
    batter,
    familiarity,
    count
  )

  if (!contact) {
    return {
      swing: true,
      contact: false,
      is_foul: null,
      exit_velocity: null,
      launch_angle: null,
      ...applyPitchToCount(count, 'strike', false),
    }
  }

  // 4. 컨택 성공 → EV, LA, 방향각 모두 생성 (페어·파울 공통)
  const { exit_velocity, launch_angle } = calcBattedBall(pitch.zone_type, batter)
  const theta_h = selectDirectionAngle(batter, pitch.zone_type)
  const territory = classifyTerritory(theta_h)

  // ── 5a. 페어 타구 ──────────────────────────────────────────
  if (territory === 'fair') {
    const hitDetail = resolveHitResult(exit_velocity, launch_angle, batter, defenceLineup ?? [], theta_h)
    return {
      swing: true,
      contact: true,
      is_foul: false,
      exit_velocity,
      launch_angle,
      at_bat_result: hitDetail.result,
      hit_physics:   hitDetail,
      next_count: count,
      at_bat_over: true,
    }
  }

  // ── 5b. 수비 가능 파울 영역 ─────────────────────────────────
  if (territory === 'foul_catchable') {
    const foulResult = resolveFoulCatchable(exit_velocity, launch_angle, theta_h, defenceLineup ?? [])

    if (foulResult.caught && !foulResult.isError && foulResult.hitDetail) {
      // 파울 플라이 아웃 (태그업 가능 — hit_physics 포함)
      return {
        swing: true,
        contact: true,
        is_foul: true,
        exit_velocity,
        launch_angle,
        at_bat_result: 'out',
        hit_physics:   foulResult.hitDetail,
        next_count: count,
        at_bat_over: true,
      }
    }

    if (foulResult.caught && foulResult.isError) {
      // 파울 플라이 에러 → 파울 처리, 오버레이 표시
      return {
        swing: true,
        contact: true,
        is_foul: true,
        exit_velocity,
        launch_angle,
        foul_fly_error: true,
        foul_error_fielder: foulResult.fielder
          ? { name: foulResult.fielder.name, position_1: foulResult.fielder.position_1 }
          : undefined,
        ...applyPitchToCount(count, 'foul', false),
      }
    }

    // 수비 도달 불가 또는 땅볼 → 순수 파울 (fall through to foul tip check)
  }

  // ── 5c. 관중석 파울 또는 수비 불가 파울 ──────────────────────
  // 2스트라이크 파울팁 체크 → 삼진
  if (count.strikes >= 2 && Math.random() < PHYSICS_CONFIG.foul_tip_prob) {
    return {
      swing: true,
      contact: true,
      is_foul: true,
      exit_velocity,
      launch_angle,
      is_foul_tip: true,
      ...applyPitchToCount(count, 'strike', false),
    }
  }

  // 순수 파울 → 다음 투구
  return {
    swing: true,
    contact: true,
    is_foul: true,
    exit_velocity,
    launch_angle,
    ...applyPitchToCount(count, 'foul', false),
  }
}
