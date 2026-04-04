import type { Player }                                        from '../types/player'
import type { Runners, AtBatContext, AtBatOutcome, GameEvent } from './types'
import type { StealState } from './runner-advance'
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

        // ④ hitBall — 타격 결과를 먼저 확인 (타격 우선 원칙)
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

        // ⑤ 타격 발생 시 → 도루 판정 스킵, 도루 중 위치를 stealState로 전달
        if (batting.at_bat_over) {
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
          events.push({
            type: 'at_bat_result',
            inning,
            isTop,
            payload: { batter, result: batting.at_bat_result },
          })
          if (batting.at_bat_result === 'reach_on_error' && batting.hit_physics) {
            events.push({
              type: 'fielding_error',
              inning,
              isTop,
              payload: { fielder: batting.hit_physics.fielder, batter },
            })
          }

          const stealStateForAdvance: StealState = {
            runner:      stealRunner,
            base:        stealBase,
            t_steal_run: 1.8,
          }

          const { nextRunners, runsScored, moves, outs_added: runnerOuts, events: runnerEvents } = advanceRunners(
            batting.at_bat_result,
            currentRunners,
            batter,
            batting.hit_physics,
            stealStateForAdvance,
            defenceLineup,
            { battingScore: ctx.battingScore, defenseScore: ctx.defenseScore },
            { inning, isTop },
            ctx.outs,
          )

          events.push(...runnerEvents)

          const atBatOut =
            batting.at_bat_result === 'strikeout' ? 1 :
            batting.at_bat_result === 'out'       ? 1 :
            0  // double_play / fielders_choice → outs_added는 resolveInfieldOut에 위임
          const outs_added = atBatOut + runnerOuts

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

        // ⑥ 타격 없음 → 기존 도루 성공/실패 판정
        const throwDecision = decideCatcherThrow(currentRunners, catcher, pitcher, pitch)
        const to = stealBase === 1 ? 2 : 3

        if (throwDecision.throwBase !== null && throwDecision.targetRunner) {
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
            currentRunners = advanceStealRunner(currentRunners, stealBase)

            // 1+3루 상황에서 포수가 2루 송구 선택 → 3루 주자 홈 쇄도 독립 판정
            if (throwDecision.throwBase === 2 && currentRunners.third) {
              const thirdRunner = currentRunners.third
              const homeResult  = resolveStealResult(
                thirdRunner, 'home', pitch, catcher, isSwingAndMiss, pickoutCount,
              )
              events.push({
                type: 'steal_result',
                inning,
                isTop,
                payload: { runner: thirdRunner, from: 3, to: 'home', success: homeResult === 'success' },
              })
              // 성공/실패 모두 3루 주자 제거 (홈 쇄도 시도)
              currentRunners = { ...currentRunners, third: null }
            }
          }
        } else {
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
      if (batting.at_bat_result === 'reach_on_error' && batting.hit_physics) {
        events.push({
          type: 'fielding_error',
          inning,
          isTop,
          payload: { fielder: batting.hit_physics.fielder, batter },
        })
      }

      const { nextRunners, runsScored, moves, outs_added: runnerOuts, events: runnerEvents } = advanceRunners(
        batting.at_bat_result,
        currentRunners,
        batter,
        batting.hit_physics,
        undefined,
        defenceLineup,
        { battingScore: ctx.battingScore, defenseScore: ctx.defenseScore },
        { inning, isTop },
        ctx.outs,
      )

      events.push(...runnerEvents)

      const atBatOut =
        batting.at_bat_result === 'strikeout' ? 1 :
        batting.at_bat_result === 'out'       ? 1 :
        0  // double_play / fielders_choice は resolveInfieldOut の outs_added に委譲
      const outs_added = atBatOut + runnerOuts

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
