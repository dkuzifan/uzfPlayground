import type { Player } from '../types/player'
import type { GameEvent } from './types'
import type { BatterGameStats, PitcherGameStats, GameStats } from './stats-types'

// ============================================================
// calcGameStats — GameEvent[] → GameStats 리듀서
// ============================================================

type TeamInfo = { lineup: Player[]; pitcher: Player; bullpen?: Player[] }

interface TeamState {
  batters:        Map<string, BatterGameStats>
  pitchers:       Map<string, PitcherGameStats>
  batterOrder:    string[]   // 첫 등장 순서
  pitcherOrder:   string[]   // 등판 순서
  currentPitcher: string     // 현재 마운드 투수 id
  score:          number
}

function makeBatterStats(player: Player): BatterGameStats {
  return { player, AB: 0, H: 0, '2B': 0, '3B': 0, HR: 0, BB: 0, SO: 0, RBI: 0, SB: 0, CS: 0 }
}

function makePitcherStats(player: Player): PitcherGameStats {
  return { player, outs: 0, H: 0, ER: 0, BB: 0, SO: 0, W: false, L: false, SV: false }
}

function initTeamState(team: TeamInfo): TeamState {
  const pitchers = new Map<string, PitcherGameStats>()
  pitchers.set(team.pitcher.id, makePitcherStats(team.pitcher))

  return {
    batters:        new Map(),
    pitchers,
    batterOrder:    [],
    pitcherOrder:   [team.pitcher.id],
    currentPitcher: team.pitcher.id,
    score:          0,
  }
}

function getBatter(state: TeamState, player: Player): BatterGameStats {
  if (!state.batters.has(player.id)) {
    state.batters.set(player.id, makeBatterStats(player))
    state.batterOrder.push(player.id)
  }
  return state.batters.get(player.id)!
}

function getCurrentPitcher(state: TeamState): PitcherGameStats {
  return state.pitchers.get(state.currentPitcher)!
}

// ============================================================
// 메인 함수
// ============================================================

export function calcGameStats(
  events:   GameEvent[],
  homeTeam: TeamInfo,
  awayTeam: TeamInfo,
): GameStats {
  const home = initTeamState(homeTeam)
  const away = initTeamState(awayTeam)

  // RBI 귀속용: at_bat_result 직후 runner_advance까지 유지
  let pendingBatter: { state: TeamState; id: string } | null = null

  // ── Pass 1: 이벤트 순회 ──────────────────────────────────────
  for (const event of events) {
    // 공격팀/수비팀 결정: isTop === true → 원정팀 공격, 홈팀 수비
    const offState = event.isTop ? away : home
    const defState = event.isTop ? home : away

    switch (event.type) {

      case 'at_bat_result': {
        const batter = event.payload.batter as Player
        const result = event.payload.result as string
        const b = getBatter(offState, batter)
        const p = getCurrentPitcher(defState)

        switch (result) {
          case 'single':
            b.AB++; b.H++
            p.H++
            pendingBatter = { state: offState, id: batter.id }
            break
          case 'double':
            b.AB++; b.H++; b['2B']++
            p.H++
            pendingBatter = { state: offState, id: batter.id }
            break
          case 'triple':
            b.AB++; b.H++; b['3B']++
            p.H++
            pendingBatter = { state: offState, id: batter.id }
            break
          case 'home_run':
            b.AB++; b.H++; b.HR++
            p.H++
            pendingBatter = { state: offState, id: batter.id }
            break
          case 'out':
            b.AB++
            p.outs++
            pendingBatter = null
            break
          case 'strikeout':
            b.AB++; b.SO++
            p.outs++; p.SO++
            pendingBatter = null
            break
          case 'walk':
          case 'hit_by_pitch':
            b.BB++
            p.BB++
            pendingBatter = { state: offState, id: batter.id }  // 만루 볼넷 RBI 가능
            break
          case 'pickoff_out':
          case 'caught_stealing':
            p.outs++
            pendingBatter = null
            break
        }
        break
      }

      case 'runner_advance': {
        const moves = event.payload.moves as Array<{ runner: Player; from: unknown; to: unknown }>
        const runsScored = moves.filter(m => m.to === 'home').length

        if (runsScored > 0 && pendingBatter) {
          const b = pendingBatter.state.batters.get(pendingBatter.id)
          if (b) b.RBI += runsScored
        }
        pendingBatter = null
        break
      }

      case 'score': {
        const runs = event.payload.runs_scored as number
        // 수비팀 투수의 자책점
        getCurrentPitcher(defState).ER += runs
        // 팀 스코어 업데이트 (W/L 판정용)
        offState.score += runs
        break
      }

      case 'steal_result': {
        const runner  = event.payload.runner as Player
        const success = event.payload.success as boolean
        const b = getBatter(offState, runner)
        if (success) b.SB++
        else         b.CS++
        break
      }

      case 'pitching_change': {
        const incoming = event.payload.incoming as Player
        // defState가 수비팀 (교체 발생 팀)
        if (!defState.pitchers.has(incoming.id)) {
          defState.pitchers.set(incoming.id, makePitcherStats(incoming))
        }
        defState.currentPitcher = incoming.id
        defState.pitcherOrder.push(incoming.id)
        break
      }
    }
  }

  // ── Pass 2: W/L/SV 후처리 ───────────────────────────────────
  const gameEnd = events.find(e => e.type === 'game_end')
  if (gameEnd) {
    const winner = gameEnd.payload.winner as 'home' | 'away' | 'draw'
    assignWLS(events, home, away, winner)
  }

  // ── 결과 조립 ────────────────────────────────────────────────
  return {
    home: {
      batters:  home.batterOrder.map(id => home.batters.get(id)!),
      pitchers: home.pitcherOrder.map(id => home.pitchers.get(id)!),
    },
    away: {
      batters:  away.batterOrder.map(id => away.batters.get(id)!),
      pitchers: away.pitcherOrder.map(id => away.pitchers.get(id)!),
    },
  }
}

// ============================================================
// W/L/SV 판정
// ============================================================

function assignWLS(
  events:  GameEvent[],
  home:    TeamState,
  away:    TeamState,
  winner:  'home' | 'away' | 'draw',
): void {
  if (winner === 'draw') return

  const winState  = winner === 'home' ? home : away
  const loseState = winner === 'home' ? away : home

  // score 이벤트를 순서대로 재순회하여
  // 승리팀이 최종 리드를 확정한 시점의 수비팀(패배팀) 투수를 패전 투수로,
  // 그 시점의 승리팀 투수를 승리 투수로 기록
  let h = 0, a = 0
  let winPitcherId  = winState.pitcherOrder[0]
  let losePitcherId = loseState.pitcherOrder[0]

  // 승리팀이 마지막으로 리드를 취한 시점 추적
  let lastLeadWinPitcher  = winState.pitcherOrder[0]
  let lastLeadLosePitcher = loseState.pitcherOrder[0]

  // pitching_change 이벤트로 각 시점의 현재 투수를 시뮬
  let curHome = home.pitcherOrder[0]
  let curAway = away.pitcherOrder[0]

  for (const event of events) {
    if (event.type === 'pitching_change') {
      const incoming = (event.payload.incoming as Player).id
      // isTop === true → 홈팀이 수비 → 홈팀 투수 교체
      if (event.isTop) curHome = incoming
      else             curAway = incoming
    }

    if (event.type === 'score') {
      const runs = event.payload.runs_scored as number
      if (event.isTop) a += runs
      else             h += runs

      const wasWinLeading = winner === 'home' ? (h - runs) > a : (a - runs) > h

      // 승리팀이 리드를 새로 취하거나 유지한 경우
      const winLeads = winner === 'home' ? h > a : a > h
      if (winLeads && !wasWinLeading) {
        // 리드 취득 시점 갱신
        lastLeadWinPitcher  = winner === 'home' ? curHome : curAway
        lastLeadLosePitcher = winner === 'home' ? curAway : curHome
      }
    }
  }

  winPitcherId  = lastLeadWinPitcher
  losePitcherId = lastLeadLosePitcher

  const wPitcher = winState.pitchers.get(winPitcherId)
  const lPitcher = loseState.pitchers.get(losePitcherId)
  if (wPitcher) wPitcher.W = true
  if (lPitcher) lPitcher.L = true

  // 세이브: 승리팀 마지막 투수가 W 투수와 다르고 점수차 ≤ 3
  const lastWinPitcherId = winState.pitcherOrder.at(-1)!
  if (lastWinPitcherId !== winPitcherId) {
    const finalMargin = Math.abs(winState.score - loseState.score)
    if (finalMargin <= 3) {
      const svPitcher = winState.pitchers.get(lastWinPitcherId)
      if (svPitcher) svPitcher.SV = true
    }
  }
}
