import type { Player }                                        from '../types/player'
import type { Runners, AtBatContext, AtBatOutcome, GameEvent } from './types'
import type { StealState } from './runner-advance'
import { throwPitch }      from '../engine/throw-pitch'
import { hitBall }         from '../batting/hit-ball'
import { advanceRunners }  from './runner-advance'
import { decidePickoff, resolvePickoff }                          from '../engine/pickoff'
import { decideStealAttempt, resolveStealResult, decideCatcherThrow } from './stolen-base'
import { WILD_PITCH_BASE } from './config'

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
// checkWildPitch — 폭투/패스트볼 체크
// 주자가 있을 때 투구마다 호출. WP 발생 시 주자 1베이스 진루.
// ============================================================

function checkWildPitch(
  pitcher:  Player,
  runners:  Runners,
  isWild:   boolean,     // 투구가 ball zone에 도달했는지
): { occurred: boolean; nextRunners: Runners; runsScored: number;
     advances: Array<{ runner: Player; from: number; to: number | 'home' }> } {
  const hasRunners = runners.first !== null || runners.second !== null || runners.third !== null
  if (!hasRunners) return { occurred: false, nextRunners: runners, runsScored: 0, advances: [] }

  // WP 확률: 기본 × 제구 보정 × 존 보정
  const control_factor = 1.2 - (pitcher.stats.ball_control / 100) * 0.8   // 0.4~1.2
  const zone_factor    = isWild ? 2.0 : 0.5                               // ball zone 투구 → 2배
  const p_wp = WILD_PITCH_BASE * control_factor * zone_factor

  if (Math.random() >= p_wp) return { occurred: false, nextRunners: runners, runsScored: 0, advances: [] }

  // WP 발생 → 모든 주자 1베이스 진루
  let runsScored = 0
  const advances: Array<{ runner: Player; from: number; to: number | 'home' }> = []
  const next: Runners = { first: null, second: null, third: null }

  if (runners.third) {
    runsScored++
    advances.push({ runner: runners.third, from: 3, to: 'home' })
  }
  if (runners.second) {
    next.third = runners.second
    advances.push({ runner: runners.second, from: 2, to: 3 })
  }
  if (runners.first) {
    next.second = runners.first
    advances.push({ runner: runners.first, from: 1, to: 2 })
  }

  return { occurred: true, nextRunners: next, runsScored, advances }
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
  let pickoutCount    = 0                   // ���석 내 견제 실패 횟수
  let wpRunsAccum     = 0                   // 타석 내 폭투 득점 누적

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
          runs_scored:         wpRunsAccum,
          next_runners:        currentRunners,
          moves:               [{ runner: pickoff.runner, from: pickoff.base, to: pickoff.base, wasOut: true }],
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

    // ②-b [투구 후] 폭투/패스트볼 체크
    const isWildZone = pitch.zone_type === 'ball' || pitch.zone_type === 'chase'
    const wp = checkWildPitch(pitcher, currentRunners, isWildZone)
    if (wp.occurred) {
      currentRunners = wp.nextRunners

      events.push({
        type: 'pitch',
        inning,
        isTop,
        payload: {
          pitch,
          swing:      false,
          contact:    null,
          is_foul:    null,
          next_count: count,  // WP는 카운트에 영향 없음 (볼/스트라이크는 별도 처리)
        },
      })
      events.push({
        type: 'wild_pitch',
        inning,
        isTop,
        payload: { pitcher, runners_advanced: wp.advances },
      })

      // WP 득점 누적 (타석 종료 시 합산)
      wpRunsAccum += wp.runsScored

      // 카운트는 그대로 유지, 다음 투구로 (WP는 볼/스트라이크와 별개)
      // 실제 MLB: WP 시 투구는 여전히 볼/스트라이크로 카운트됨
      // 간소화: WP 투구는 카운트 미반영 (다음 투구에서 처리)
      continue
    }

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
          recent_pitches,
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
            payload: {
              batter,
              result:    batting.at_bat_result,
              ball_type: batting.hit_physics?.ball_type,
              fielder:   batting.hit_physics?.fielder,
              theta_h:   batting.hit_physics?.theta_h,
              range:     batting.hit_physics?.range,
              is_foul_fly: batting.is_foul === true && batting.at_bat_result === 'out',
              is_foul_tip: batting.is_foul_tip,
            },
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
            runs_scored:         runsScored + wpRunsAccum,
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
              runs_scored:         wpRunsAccum,
              next_runners:        currentRunners,
              moves:               [{ runner: stealRunner, from: stealBase, to: stealBase, wasOut: true }],
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
      recent_pitches,
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

    // 파울 플라이 에러 오버레이 이벤트
    if (batting.foul_fly_error) {
      events.push({
        type: 'foul_fly_error',
        inning,
        isTop,
        payload: { fielder: batting.foul_error_fielder, batter },
      })
    }

    if (batting.at_bat_over) {
      events.push({
        type: 'at_bat_result',
        inning,
        isTop,
        payload: {
          batter,
          result:    batting.at_bat_result,
          ball_type: batting.hit_physics?.ball_type,
          fielder:   batting.hit_physics?.fielder,
          theta_h:   batting.hit_physics?.theta_h,
          range:     batting.hit_physics?.range,
          is_foul_fly: batting.is_foul === true && batting.at_bat_result === 'out',
          is_foul_tip: batting.is_foul_tip,
        },
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
        0  // double_play / fielders_choice → resolveInfieldOut の outs_added に委譲
      const outs_added = atBatOut + runnerOuts

      return {
        result:              batting.at_bat_result,
        outs_added,
        runs_scored:         runsScored + wpRunsAccum,
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
