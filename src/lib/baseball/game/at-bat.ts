import type { Player }                                        from '../types/player'
import type { Runners, AtBatContext, AtBatOutcome, GameEvent } from './types'
import { throwPitch }      from '../engine/throw-pitch'
import { hitBall }         from '../batting/hit-ball'
import { advanceRunners }  from './runner-advance'
import { decidePickoff, resolvePickoff }                          from '../engine/pickoff'
import { decideStealAttempt, resolveStealResult, decideCatcherThrow } from './stolen-base'

// ============================================================
// runners 포맷 변환: Player|null → boolean (엔진 호환)
// ============================================================

function toBoolRunners(r: Runners) {
  return { first: r.first !== null, second: r.second !== null, third: r.third !== null }
}

// ============================================================
// 주자 제거/진루 헬퍼
// ============================================================

function removeRunner(runners: Runners, base: 1 | 2): Runners {
  if (base === 1) return { ...runners, first: null }
  return { ...runners, second: null }
}

function advanceStealRunner(runners: Runners, from: 1 | 2): Runners {
  if (from === 1) {
    // 1루 주자 → 2루
    return { ...runners, first: null, second: runners.first }
  } else {
    // 2루 주자 → 3루
    return { ...runners, second: null, third: runners.second }
  }
}

// ============================================================
// runAtBat — 단일 타석 루프
// throwPitch → hitBall 반복, at_bat_over=true 까지
// ============================================================

export function runAtBat(
  pitcher:         Player,
  batter:          Player,
  ctx:             AtBatContext,
  defenceLineup?:  Player[],
): AtBatOutcome {
  const { inning, isTop, catcher } = ctx
  const events: GameEvent[] = []

  let count           = { balls: 0, strikes: 0 }
  let stamina         = ctx.stamina
  let familiarity     = ctx.familiarity
  let recent_pitches  = ctx.recent_pitches
  let currentRunners  = { ...ctx.runners }  // 타석 내 mutable 주자 상태
  let pickoutCount    = 0                   // 타석 내 견제 실패 횟수

  while (true) {

    // ① [투구 전] 견제 체크
    const pickoff = decidePickoff(pitcher, currentRunners)
    if (pickoff.attempt && pickoff.runner && pickoff.base) {
      events.push({
        type: 'pickoff_attempt',
        inning,
        isTop,
        payload: { pitcher, runner: pickoff.runner, base: pickoff.base },
      })

      const pickoffResult = resolvePickoff(pitcher, pickoff.runner)
      events.push({
        type: 'pickoff_result',
        inning,
        isTop,
        payload: { runner: pickoff.runner, base: pickoff.base, out: pickoffResult === 'out' },
      })

      if (pickoffResult === 'out') {
        currentRunners = removeRunner(currentRunners, pickoff.base)
        events.push({
          type: 'at_bat_result',
          inning,
          isTop,
          payload: { batter, result: 'pickoff_out' },
        })
        return {
          result:              'pickoff_out',
          outs_added:          1,
          runs_scored:         0,
          next_runners:        currentRunners,
          moves:               [{ runner: pickoff.runner, from: pickoff.base, to: pickoff.base }],
          next_stamina:        stamina,
          next_familiarity:    familiarity,
          next_recent_pitches: recent_pitches,
          events,
        }
      } else {
        pickoutCount++
      }
    }

    // ② throwPitch
    const pitchState = {
      pitcher,
      batter,
      count,
      outs:              ctx.outs,
      runners:           toBoolRunners(currentRunners),
      recent_pitches,
      remaining_stamina: stamina,
      familiarity,
      inning,
      is_scoring_position: currentRunners.second !== null || currentRunners.third !== null,
    }

    const pitch    = throwPitch(pitchState)
    stamina        = pitch.next_stamina
    familiarity    = pitch.next_familiarity
    recent_pitches = [...recent_pitches, { type: pitch.pitch_type, zone: pitch.actual_zone }].slice(-10)

    // ③ [투구 후] 도루 시도 체크
    // 선행 주자 우선 (2루 주자 > 1루 주자)
    const stealRunner = currentRunners.second ?? currentRunners.first
    const stealBase   = currentRunners.second ? 2 : currentRunners.first ? 1 : null

    if (stealRunner && stealBase !== null) {
      const attempt = decideStealAttempt(stealRunner, stealBase, pitcher, catcher, pickoutCount)

      if (attempt) {
        events.push({
          type: 'steal_attempt',
          inning,
          isTop,
          payload: { runner: stealRunner, from: stealBase },
        })

        // ④ hitBall (헛스윙 여부 필요)
        const battingState = {
          pitcher,
          batter,
          count,
          outs:      ctx.outs,
          runners:   toBoolRunners(currentRunners),
          familiarity,
          inning,
        }
        const batting = hitBall(battingState, pitch, defenceLineup)
        const isSwingAndMiss = batting.swing && batting.contact === false

        // ⑤ 포수 송구 결정
        const throwDecision = decideCatcherThrow(currentRunners, catcher, pitcher, pitch)
        const to = stealBase === 1 ? 2 : 3

        if (throwDecision.throwBase !== null && throwDecision.targetRunner) {
          // 포수가 선행 주자에게 송구
          const stealResult = resolveStealResult(
            stealRunner, to, pitch, catcher, isSwingAndMiss, pickoutCount,
          )

          events.push({
            type: 'steal_result',
            inning,
            isTop,
            payload: { runner: stealRunner, from: stealBase, to, success: stealResult === 'success' },
          })

          if (stealResult === 'caught') {
            currentRunners = removeRunner(currentRunners, stealBase)
            events.push({
              type: 'at_bat_result',
              inning,
              isTop,
              payload: { batter, result: 'caught_stealing' },
            })
            return {
              result:              'caught_stealing',
              outs_added:          1,
              runs_scored:         0,
              next_runners:        currentRunners,
              moves:               [{ runner: stealRunner, from: stealBase, to: stealBase }],
              next_stamina:        stamina,
              next_familiarity:    familiarity,
              next_recent_pitches: recent_pitches,
              events,
            }
          } else {
            // 도루 성공 → 주자 진루
            currentRunners = advanceStealRunner(currentRunners, stealBase)

            // 1+3루 상황에서 포수가 2루 송구 선택 → 3루 주자 홈 쇄도 독립 판정
            if (throwDecision.throwBase === 2 && currentRunners.third) {
              const thirdRunner   = currentRunners.third
              const homeResult    = resolveStealResult(
                thirdRunner, 'home', pitch, catcher, isSwingAndMiss, pickoutCount,
              )
              events.push({
                type: 'steal_result',
                inning,
                isTop,
                payload: { runner: thirdRunner, from: 3, to: 'home', success: homeResult === 'success' },
              })
              if (homeResult === 'success') {
                currentRunners = { ...currentRunners, third: null }
                // 득점은 타석 종료 후 advanceRunners에서 처리되므로
                // 여기서는 주자만 제거 (runs_scored는 0 — 이 홈 쇄도 득점은 별도 카운트 필요)
                // TODO: 홈 쇄도 득점 처리 개선 필요 (현재 MVP에서는 미반영)
              } else {
                currentRunners = { ...currentRunners, third: null }
              }
            }
          }
        } else {
          // 포수 송구 포기 (1+3루에서 홈 쇄도 성공률 > 0.5)
          // 1루 주자는 2루 세이프
          currentRunners = advanceStealRunner(currentRunners, stealBase)
          events.push({
            type: 'steal_result',
            inning,
            isTop,
            payload: { runner: stealRunner, from: stealBase, to, success: true },
          })
        }

        // 볼카운트 업데이트 후 다음 투구로
        count = batting.next_count

        events.push({
          type: 'pitch',
          inning,
          isTop,
          payload: {
            pitch,
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
            currentRunners,
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

        continue
      }
    }

    // ⑥ 일반 hitBall (도루 없는 경우)
    const battingState = {
      pitcher,
      batter,
      count,
      outs:      ctx.outs,
      runners:   toBoolRunners(currentRunners),
      familiarity,
      inning,
    }

    const batting = hitBall(battingState, pitch, defenceLineup)
    count = batting.next_count

    events.push({
      type: 'pitch',
      inning,
      isTop,
      payload: {
        pitch,
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
        currentRunners,
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
