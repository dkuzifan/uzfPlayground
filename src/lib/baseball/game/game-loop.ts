import type { Player } from '../types/player'
import type { GameEvent, GameResult, ExtraInningsRule } from './types'
import { EMPTY_RUNNERS } from './types'
import { GAME_CONFIG }   from './config'
import { runHalfInning } from './half-inning'

// ============================================================
// runGame — 9이닝 경기 (연장 포함)
// ============================================================

export function runGame(
  homeTeam: { lineup: Player[]; pitcher: Player; bullpen?: Player[] },
  awayTeam: { lineup: Player[]; pitcher: Player; bullpen?: Player[] },
  options?: { extra_innings_rule?: ExtraInningsRule },
): GameResult {
  const extraRule = options?.extra_innings_rule ?? GAME_CONFIG.extra_innings_rule

  const allEvents: GameEvent[] = []
  const linescore = { away: [] as number[], home: [] as number[] }

  let scoreHome = 0
  let scoreAway = 0
  let awayBatterIdx = 0
  let homeBatterIdx = 0
  let awayStamina   = awayTeam.pitcher.stats.stamina
  let homeStamina   = homeTeam.pitcher.stats.stamina
  let awayFamiliarity: any = {}
  let homeFamiliarity: any = {}

  // 투수 교체 추적
  let homePitcher  = homeTeam.pitcher
  let awayPitcher  = awayTeam.pitcher
  let homeBullpen  = [...(homeTeam.bullpen ?? [])]
  let awayBullpen  = [...(awayTeam.bullpen ?? [])]

  let inning = 1
  let winner: 'home' | 'away' | 'draw' | null = null
  let reason: 'normal' | 'walk_off' | 'draw' = 'normal'

  while (inning <= GAME_CONFIG.max_innings_hard_cap) {
    // ── 이닝 초 (원정팀 공격) ──────────────────────────────
    const topResult = runHalfInning(
      awayTeam.lineup,
      homePitcher,
      awayBatterIdx,
      inning,
      true,
      {
        outs:        0,
        runners:     EMPTY_RUNNERS,
        stamina:     homeStamina,
        familiarity: homeFamiliarity,
        scoreHome,
        scoreAway,
        bullpen:     homeBullpen,
      },
    )

    allEvents.push(...topResult.events)
    scoreAway      += topResult.runs
    awayBatterIdx   = topResult.nextBatterIdx
    homeStamina     = topResult.nextStamina
    homeFamiliarity = topResult.nextFamiliarity
    homePitcher     = topResult.currentPitcher
    homeBullpen     = topResult.remainingBullpen

    // ── 말 이닝 생략 조건 ──────────────────────────────────
    // 9회 이상이고 홈팀이 이미 앞서면 말 공격 없이 종료
    if (inning >= GAME_CONFIG.max_innings && scoreHome > scoreAway) {
      linescore.away.push(topResult.runs)
      winner = 'home'
      reason = 'normal'
      break
    }

    // ── 이닝 말 (홈팀 공격) ───────────────────────────────
    const botResult = runHalfInning(
      homeTeam.lineup,
      awayPitcher,
      homeBatterIdx,
      inning,
      false,
      {
        outs:         0,
        runners:      EMPTY_RUNNERS,
        stamina:      awayStamina,
        familiarity:  awayFamiliarity,
        scoreHome,
        scoreAway,
        allowWalkOff: inning >= GAME_CONFIG.max_innings,
        bullpen:      awayBullpen,
      },
    )

    allEvents.push(...botResult.events)
    scoreHome      += botResult.runs
    homeBatterIdx   = botResult.nextBatterIdx
    awayStamina     = botResult.nextStamina
    awayFamiliarity = botResult.nextFamiliarity
    awayPitcher     = botResult.currentPitcher
    awayBullpen     = botResult.remainingBullpen

    linescore.away.push(topResult.runs)
    linescore.home.push(botResult.runs)

    // 끝내기
    if (botResult.walkOff) {
      winner = 'home'
      reason = 'walk_off'
      break
    }

    // 9이닝 이상에서 승패 결정
    if (inning >= GAME_CONFIG.max_innings) {
      if (scoreHome !== scoreAway) {
        winner = scoreHome > scoreAway ? 'home' : 'away'
        reason = 'normal'
        break
      }

      // 동점 — extra_innings_rule 분기
      if (extraRule === 'max12' && inning >= 12) {
        winner = 'draw'
        reason = 'draw'
        break
      }
      if (inning >= GAME_CONFIG.max_innings_hard_cap) {
        winner = 'draw'
        reason = 'draw'
        break
      }
      // 'unlimited' or 아직 연장 이닝 — 다음 이닝 계속
    }

    inning++
  }

  // 하드캡 초과로 루프 탈출한 경우
  if (winner === null) {
    winner = scoreHome > scoreAway ? 'home' : scoreAway > scoreHome ? 'away' : 'draw'
    reason = winner === 'draw' ? 'draw' : 'normal'
  }

  allEvents.push({
    type:    'game_end',
    inning,
    isTop:   false,
    payload: { winner, reason, score: { home: scoreHome, away: scoreAway } },
  })

  return {
    winner,
    score:     { home: scoreHome, away: scoreAway },
    linescore,
    reason,
    events:    allEvents,
  }
}
