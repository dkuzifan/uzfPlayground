import type { Player } from '../types/player'
import type { GameEvent, HalfInningInit, HalfInningResult } from './types'
import { EMPTY_RUNNERS } from './types'
import { decayFamiliarity } from '../engine/familiarity'
import { runAtBat }         from './at-bat'

// ============================================================
// runHalfInning
// ============================================================

export function runHalfInning(
  lineup:    Player[],   // 9명 타선
  pitcher:   Player,
  batterIdx: number,     // 이 반이닝 시작 타자 인덱스 (0~8)
  inning:    number,
  isTop:     boolean,
  init:      HalfInningInit,
): HalfInningResult {
  const events: GameEvent[] = []

  events.push({
    type: 'inning_start',
    inning,
    isTop,
    payload: { inning, isTop },
  })

  let outs           = init.outs
  let runners        = init.runners
  let stamina        = init.stamina
  let familiarity    = init.familiarity
  let recent_pitches: Array<{ type: any; zone: any }> = []
  let totalRuns      = 0
  let currentIdx     = batterIdx
  let walkOff        = false
  let scoreHome      = init.scoreHome
  let scoreAway      = init.scoreAway

  while (outs < 3) {
    const batter  = lineup[currentIdx]
    const outcome = runAtBat(pitcher, batter, {
      outs,
      runners,
      inning,
      isTop,
      familiarity,
      stamina,
      recent_pitches,
    })

    events.push(...outcome.events)

    // runner_advance 이벤트 — runAtBat이 반환한 moves 활용
    if (outcome.moves.length > 0) {
      events.push({
        type: 'runner_advance',
        inning,
        isTop,
        payload: { moves: outcome.moves },
      })
    }

    // score 이벤트
    if (outcome.runs_scored > 0) {
      if (isTop) scoreAway += outcome.runs_scored
      else       scoreHome += outcome.runs_scored

      events.push({
        type: 'score',
        inning,
        isTop,
        payload: {
          runs_scored:     outcome.runs_scored,
          runs_total_home: scoreHome,
          runs_total_away: scoreAway,
        },
      })
    }

    outs           += outcome.outs_added
    runners         = outcome.next_runners
    stamina         = outcome.next_stamina
    familiarity     = outcome.next_familiarity
    recent_pitches  = outcome.next_recent_pitches
    totalRuns      += outcome.runs_scored
    currentIdx      = (currentIdx + 1) % 9

    // 끝내기 감지: 말 이닝에서 홈팀이 앞서는 득점 발생 (9이닝 이상 허용된 경우만)
    if (!isTop && init.allowWalkOff && scoreHome > scoreAway) {
      walkOff = true
      break
    }
  }

  // 반이닝 종료 시 familiarity 감쇠
  familiarity = decayFamiliarity(familiarity)

  events.push({
    type: 'inning_end',
    inning,
    isTop,
    payload: { runs_this_half: totalRuns },
  })

  return {
    runs:            totalRuns,
    finalRunners:    walkOff ? runners : EMPTY_RUNNERS,
    nextBatterIdx:   currentIdx,
    nextStamina:     stamina,
    nextFamiliarity: familiarity,
    walkOff,
    events,
  }
}
