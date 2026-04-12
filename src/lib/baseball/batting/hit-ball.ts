import type { Player }     from '../types/player'
import type { PitchResult } from '../engine/types'
import type { BattingState, BattingResult } from './types'
import { decideBunt }      from './bunt-stub'
import { decideSwing }     from './swing-decision'
import { resolveContact }  from './contact'
import { calcBattedBallV2 }  from './batted-ball'
import { resolveHitResult, resolveFoulCatchable } from './hit-result'
import { applyPitchToCount } from './count'
import { predictPitch }    from './predict-pitch'
import { readPitch }        from './read-pitch'
import { classifyTerritory } from '../defence/ball-physics'
import { PHYSICS_CONFIG } from '../defence/config'

// 구종별 속도 지표 (batted-ball.ts와 동일)
const PITCH_SPEED_INDEX: Record<string, number> = {
  fastball: 1.00, twoseam: 0.98, sinker: 0.95, cutter: 0.93, slider: 0.82,
  curveball: 0.72, changeup: 0.80, splitter: 0.83, forkball: 0.78,
}

// ============================================================
// hitBall — v2 통합 타격 파이프라인
//
// ① predictPitch (투구 전 예측)
// ② readPitch (투구 후 인식)
// ③ decideSwing (스윙 결정)
// ④ resolveContact (컨택 + timing/center offset)
// ⑤ calcBattedBallV2 (EV/LA/θ 통합)
// ⑥ 수비 판정 (resolveHitResult / foul 처리)
// ============================================================

export function hitBall(
  state:          BattingState,
  pitch:          PitchResult,
  defenceLineup?: Player[],
): BattingResult {
  const { pitcher, batter, count, outs, runners, familiarity, inning } = state
  const eye = batter.stats.eye ?? 50

  // 0. HBP early return
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

  // 1. 번트 결정 (stub)
  const bunt = decideBunt(batter, count, runners, { outs, inning })
  if (bunt.attempt) {
    return undefined as never
  }

  // ① 투구 전 예측
  const recentPitches = (state.recent_pitches ?? []) as Array<{ type: import('../types/player').PitchType }>
  const prediction = predictPitch(pitcher.pitch_types, recentPitches, count)

  // ② 투구 후 읽기 (Step 10: 착각 존 포함)
  const pitchDataForRead = pitcher.pitch_types.find(pt => pt.type === pitch.pitch_type)
  const throws = pitcher.throws === 'S' ? 'R' : pitcher.throws   // 스위치 투수 fallback
  const perception = readPitch(pitch, prediction, eye, pitchDataForRead, throws, batter)

  // ③ 스윙 결정
  const swing = decideSwing(batter, pitch.zone_type, count, prediction, perception, pitch.actual_x, pitch.actual_z)

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

  // ④ 컨택 판정 (timing + center offset)
  const contactResult = resolveContact(
    pitch.zone_type, pitch, pitcher, batter, familiarity, count,
    prediction, perception,
  )

  if (!contactResult.contact) {
    return {
      swing: true,
      contact: false,
      is_foul: null,
      exit_velocity: null,
      launch_angle: null,
      ...applyPitchToCount(count, 'strike', false),
    }
  }

  // ⑤ 컨택 품질 기반 파울 사전 판정
  // MLB: 컨택의 ~44%가 파울 (팁, 체크스윙, 빗맞음 등)
  // timing/center offset이 클수록 파울 확률 ↑
  const t_off = Math.abs(contactResult.timing_offset ?? 0)
  const c_off = Math.abs(contactResult.center_offset ?? 0)
  const foul_base = 0.17                              // 정타도 17% 파울 (팁·빗맞음)
  const foul_timing = Math.min(0.10, t_off * 0.5)    // 타이밍 오차 → +10% max
  const foul_center = Math.min(0.10, c_off * 0.35)   // 중심 오차 → +10% max
  const foul_prob = Math.min(0.45, foul_base + foul_timing + foul_center)

  if (Math.random() < foul_prob) {
    // 2스트라이크 파울팁 체크
    if (count.strikes >= 2 && Math.random() < PHYSICS_CONFIG.foul_tip_prob) {
      return {
        swing: true,
        contact: true,
        is_foul: true,
        exit_velocity: null,
        launch_angle: null,
        is_foul_tip: true,
        ...applyPitchToCount(count, 'strike', false),
      }
    }
    return {
      swing: true,
      contact: true,
      is_foul: true,
      exit_velocity: null,
      launch_angle: null,
      ...applyPitchToCount(count, 'foul', false),
    }
  }

  // ⑥ EV/LA/θ 통합 생성 (v2: timing + center offset 기반)
  const pitchData = pitcher.pitch_types.find(pt => pt.type === pitch.pitch_type)
  // Step 9 — 3-0 구위 감소 시 effective_ball_power 우선 적용
  const pitcher_power = pitch.effective_ball_power ?? pitchData?.ball_power ?? 50
  const speed_index = PITCH_SPEED_INDEX[pitch.pitch_type] ?? 0.85

  const batted = calcBattedBallV2(
    contactResult.timing_offset!,
    contactResult.center_offset!,
    batter,
    pitcher_power,
    speed_index,
    pitcher.throws,
  )
  const { exit_velocity, launch_angle, theta_h } = batted

  // ⑦ 영역 분류 + 수비 판정
  const territory = classifyTerritory(theta_h)

  // ── 페어 타구 ──────────────────────────────────────────
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

  // ── 수비 가능 파울 영역 ─────────────────────────────────
  if (territory === 'foul_catchable') {
    const foulResult = resolveFoulCatchable(exit_velocity, launch_angle, theta_h, defenceLineup ?? [])

    if (foulResult.caught && !foulResult.isError && foulResult.hitDetail) {
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
  }

  // ── 순수 파울 ──────────────────────────────────────────
  // 2스트라이크 파울팁 체크
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

  return {
    swing: true,
    contact: true,
    is_foul: true,
    exit_velocity,
    launch_angle,
    ...applyPitchToCount(count, 'foul', false),
  }
}
