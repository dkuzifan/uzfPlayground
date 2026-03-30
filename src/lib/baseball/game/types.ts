import type { Player } from '../types/player'
import type { PitchType } from '../types/player'
import type { ZoneId, FamiliarityMap } from '../engine/types'
import type { AtBatResult } from '../batting/types'
import type { RunnerMove } from './runner-advance'

// ============================================================
// Runners
// ============================================================

export interface Runners {
  first:  Player | null
  second: Player | null
  third:  Player | null
}

export const EMPTY_RUNNERS: Runners = { first: null, second: null, third: null }

// ============================================================
// At-Bat Context & Outcome
// ============================================================

export interface AtBatContext {
  outs:           number
  runners:        Runners
  inning:         number
  isTop:          boolean
  familiarity:    FamiliarityMap
  stamina:        number
  recent_pitches: Array<{ type: PitchType; zone: ZoneId }>
}

export interface AtBatOutcome {
  result:              AtBatResult
  outs_added:          number           // 보통 0 or 1
  runs_scored:         number
  next_runners:        Runners
  moves:               RunnerMove[]     // runner_advance 이벤트용
  next_stamina:        number
  next_familiarity:    FamiliarityMap
  next_recent_pitches: Array<{ type: PitchType; zone: ZoneId }>
  events:              GameEvent[]
}

// ============================================================
// Game Events
// ============================================================

export type GameEventType =
  | 'pitch'
  | 'at_bat_result'
  | 'runner_advance'
  | 'score'
  | 'inning_start'
  | 'inning_end'
  | 'game_end'
  // 향후 추가: 'error' | 'double_play' | 'tag_up' | 'pickoff' | 'pitching_change' | 'stolen_base'

export interface GameEvent {
  type:    GameEventType
  inning:  number
  isTop:   boolean
  payload: Record<string, unknown>
  // payload 형태 (타입별):
  //   pitch          → { pitch: PitchResult; swing: boolean; contact: boolean|null; is_foul: boolean|null; next_count: {balls,strikes} }
  //   at_bat_result  → { batter: Player; result: AtBatResult }
  //   runner_advance → { moves: Array<{ runner: Player; from: 1|2|3|'batter'; to: 1|2|3|'home' }> }
  //   score          → { scorer: Player; runs_total_home: number; runs_total_away: number }
  //   inning_start   → { inning: number; isTop: boolean }
  //   inning_end     → { runs_this_half: number }
  //   game_end       → { winner: 'home'|'away'|'draw'; reason: 'normal'|'walk_off'|'draw' }
}

// ============================================================
// Half-Inning
// ============================================================

export interface HalfInningInit {
  outs:          number   // 보통 0
  runners:       Runners
  stamina:       number
  familiarity:   FamiliarityMap
  scoreHome:     number   // 끝내기 감지용
  scoreAway:     number
  allowWalkOff?: boolean  // 9이닝 이상에서만 true (끝내기 허용 이닝)
}

export interface HalfInningResult {
  runs:             number
  finalRunners:     Runners
  nextBatterIdx:    number
  nextStamina:      number
  nextFamiliarity:  FamiliarityMap
  walkOff:          boolean
  events:           GameEvent[]
}

// ============================================================
// Game Result
// ============================================================

export type ExtraInningsRule = 'unlimited' | 'max12' | 'tiebreaker10'

export interface GameResult {
  winner:    'home' | 'away' | 'draw'
  score:     { home: number; away: number }
  linescore: { away: number[]; home: number[] }
  reason:    'normal' | 'walk_off' | 'draw'
  events:    GameEvent[]
}
