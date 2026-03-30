import type { Player } from '../types/player'
import type { Runners, AtBatContext, AtBatOutcome, GameEvent } from './types'
import { throwPitch }      from '../engine/throw-pitch'
import { hitBall }         from '../batting/hit-ball'
import { advanceRunners }  from './runner-advance'

// ============================================================
// runners 포맷 변환: Player|null → boolean (엔진 호환)
// ============================================================

function toBoolRunners(r: Runners) {
  return { first: r.first !== null, second: r.second !== null, third: r.third !== null }
}

// ============================================================
// runAtBat — 단일 타석 루프
// throwPitch → hitBall 반복, at_bat_over=true 까지
// ============================================================

export function runAtBat(
  pitcher: Player,
  batter:  Player,
  ctx:     AtBatContext,
): AtBatOutcome {
  const { inning, isTop } = ctx
  const events: GameEvent[] = []

  let count          = { balls: 0, strikes: 0 }
  let stamina        = ctx.stamina
  let familiarity    = ctx.familiarity
  let recent_pitches = ctx.recent_pitches

  while (true) {
    const pitchState = {
      pitcher,
      batter,
      count,
      outs:              ctx.outs,
      runners:           toBoolRunners(ctx.runners),
      recent_pitches,
      remaining_stamina: stamina,
      familiarity,
      inning,
      is_scoring_position: ctx.runners.second !== null || ctx.runners.third !== null,
    }

    const pitch   = throwPitch(pitchState)
    stamina       = pitch.next_stamina
    familiarity   = pitch.next_familiarity
    recent_pitches = [...recent_pitches, { type: pitch.pitch_type, zone: pitch.actual_zone }].slice(-10)

    const battingState = {
      pitcher,
      batter,
      count,
      outs:      ctx.outs,
      runners:   toBoolRunners(ctx.runners),
      familiarity,
      inning,
    }

    const batting = hitBall(battingState, pitch)
    count = batting.next_count

    // pitch 이벤트 (투구 물리 + 타자 반응 합성)
    events.push({
      type: 'pitch',
      inning,
      isTop,
      payload: {
        pitch:      pitch,
        swing:      batting.swing,
        contact:    batting.contact,
        is_foul:    batting.is_foul,
        next_count: batting.next_count,
      },
    })

    if (batting.at_bat_over) {
      events.push({
        type: 'at_bat_result',
        inning,
        isTop,
        payload: { batter, result: batting.at_bat_result },
      })

      const { nextRunners, runsScored, moves } = advanceRunners(
        batting.at_bat_result,
        ctx.runners,
        batter,
      )

      const outs_added =
        batting.at_bat_result === 'strikeout' || batting.at_bat_result === 'out' ? 1 : 0

      return {
        result:              batting.at_bat_result,
        outs_added,
        runs_scored:         runsScored,
        next_runners:        nextRunners,
        moves,
        next_stamina:        stamina,
        next_familiarity:    familiarity,
        next_recent_pitches: recent_pitches,
        events,
      }
    }
  }
}
