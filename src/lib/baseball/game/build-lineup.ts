import type { Player } from '../types/player'
import type { TeamWithStats } from '../data/teams'

export interface LineupTeam {
  lineup:  Player[]
  pitcher: Player
  bullpen: Player[]
}

/**
 * TeamWithStats → runGame 입력 형식 변환
 * 컨벤션: players[0] = SP, players[1..9] = 타자 라인업
 */
export function buildLineup(team: TeamWithStats): LineupTeam {
  const pitcher = team.players[0]
  const lineup  = team.players.slice(1)   // 9명 타자
  const bullpen = team.bullpen ?? []
  return { lineup, pitcher, bullpen }
}
