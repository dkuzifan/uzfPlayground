import type { Player } from '../types/player'
import type { PitchType } from '../types/player'
import type { ZoneId, FamiliarityMap } from '../engine/types'
import type { AtBatResult } from '../batting/types'
import type { RunnerMove } from './runner-advance'
import type { GameStats } from './stats-types'
import type { Vec2, BaseKey } from '../defence/throw-judge'

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
  catcher:        Player  // 도루/견제 판정용
  battingScore:   number  // 현재 공격 팀 점수 (isCritical 판단용)
  defenseScore:   number  // 현재 수비 팀 점수
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
  | 'pitching_change'
  | 'steal_attempt'   // { runner: Player; from: 1|2 }
  | 'steal_result'    // { runner: Player; from: 1|2; to: 2|3|'home'; success: boolean }
  | 'pickoff_attempt' // { pitcher: Player; runner: Player; base: 1|2 }
  | 'pickoff_result'  // { runner: Player; base: 1|2; out: boolean }
  | 'game_end'
  | 'secondary_throw'  // { receiver: Player; receiver_pos: Vec2; target: BaseKey; challenger: Player; out: boolean }
  | 'force_out'        // { runner: Player; from: 1|2|3; to: 2|3|'home' }
  | 'tag_up'           // { runner: Player; from: 1|2|3; to: 1|2|3|'home'; safe: boolean }
  | 'sac_fly'          // { batter: Player }
  | 'fielding_error'   // { fielder: Player; batter: Player }
  | 'throwing_error'   // { thrower: Player; runner: Player; to: BaseKey; extra_base: BaseKey }

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
  bullpen?:      Player[] // 교체 가능한 불펜 투수 목록
}

export interface HalfInningResult {
  runs:              number
  finalRunners:      Runners
  nextBatterIdx:     number
  nextStamina:       number
  nextFamiliarity:   FamiliarityMap
  walkOff:           boolean
  currentPitcher:    Player    // 교체 발생 시 새 투수, 아니면 원래 투수
  remainingBullpen:  Player[]  // 교체 후 남은 불펜
  events:            GameEvent[]
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
  stats:     GameStats
}
