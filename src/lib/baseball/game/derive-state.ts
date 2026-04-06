import type { GameEvent } from './types'
import type { Player } from '../types/player'
import type { AtBatResult } from '../batting/types'
import type { BallType } from '../defence/types'

// ============================================================
// Types
// ============================================================

export interface PitchDot {
  num:      number
  zoneX:    number    // zone-visual 기준 left % (0~100)
  zoneY:    number    // zone-visual 기준 top %  (0~100)
  result:   'ball' | 'strike' | 'foul' | 'inplay'
  isLatest: boolean
}

export type RunnerAnimEvent =
  | { type: 'runner_advance'; moves: Array<{ from: 1|2|3|'batter'; to: 1|2|3|'home'; wasOut?: boolean }> }
  | { type: 'steal_result';   from: 1|2; to: 2|3|'home'; success: boolean }
  | { type: 'tag_up';         from: 1|2|3; to: 1|2|3|'home'; safe: boolean }

export interface LiveGameState {
  score:          { home: number; away: number }
  inning:         number
  isTop:          boolean
  outs:           number
  runners:        { first: boolean; second: boolean; third: boolean }
  count:          { balls: number; strikes: number }
  currentPitcher:    Player
  currentBatter:     Player
  onDeck:            Player
  pitchDots:         PitchDot[]
  animEvents:        RunnerAnimEvent[]   // 공개된 이벤트 전체의 애니메이션 이벤트 목록
  animSeq:           number              // animEvents.length — 변화 감지용
  lastAtBatResult:   AtBatResult | null
  lastAtBatBallType: BallType | null
}

// ============================================================
// 좌표 변환
// ============================================================

const ZONE_HALF_WIDTH = 0.215   // 홈플레이트 절반 (m)
const ZONE_TOP        = 1.20    // 스트라이크존 상단 (m)
const ZONE_BOTTOM     = 0.55    // 스트라이크존 하단 (m)

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

function toZonePercent(x: number, z: number): { left: number; top: number } {
  const left = clamp(50 + (x / ZONE_HALF_WIDTH) * 25, 5, 95)
  const top  = clamp(8.5 + ((ZONE_TOP - z) / (ZONE_TOP - ZONE_BOTTOM)) * 72, 2, 98)
  return { left, top }
}

// ============================================================
// deriveState
// ============================================================

/**
 * 공개된 이벤트 배열을 스캔하여 현재 게임 상태를 파생시킨다.
 */
export function deriveState(
  events:       GameEvent[],
  homeLineup:   Player[],
  awayLineup:   Player[],
  homePitcher:  Player,
  awayPitcher:  Player,
): LiveGameState {
  let score           = { home: 0, away: 0 }
  let inning          = 1
  let isTop           = true
  let outs            = 0
  let runners         = { first: false, second: false, third: false }
  let count           = { balls: 0, strikes: 0 }
  let pitchDots:      PitchDot[] = []
  let pitchNum        = 0
  const animEvents:   RunnerAnimEvent[] = []
  let lastAtBatResult:   AtBatResult | null = null
  let lastAtBatBallType: BallType | null    = null

  // 투수 — 교체 발생 시 갱신
  let currentHomePitcher = homePitcher
  let currentAwayPitcher = awayPitcher

  // 타자 인덱스 — at_bat_result마다 +1
  let awayBatterIdx = 0
  let homeBatterIdx = 0

  for (const ev of events) {
    switch (ev.type) {

      case 'inning_start': {
        inning   = ev.inning
        isTop    = ev.isTop
        outs     = 0
        runners  = { first: false, second: false, third: false }
        count    = { balls: 0, strikes: 0 }
        pitchDots = []
        pitchNum  = 0
        lastAtBatResult   = null
        lastAtBatBallType = null
        break
      }

      case 'pitch': {
        lastAtBatResult   = null
        lastAtBatBallType = null
        const p = ev.payload as {
          pitch:      { actual_x: number; actual_z: number; is_strike: boolean }
          swing:      boolean
          contact:    boolean | null
          is_foul:    boolean | null
          next_count: { balls: number; strikes: number }
        }
        count = p.next_count

        const { left, top } = toZonePercent(p.pitch.actual_x, p.pitch.actual_z)

        let result: PitchDot['result']
        if (p.is_foul) {
          result = 'foul'
        } else if (p.contact === true) {
          result = 'inplay'
        } else if (p.swing && !p.contact) {
          result = 'strike'  // 헛스윙: 존 밖이라도 스트라이크
        } else if (p.pitch.is_strike) {
          result = 'strike'
        } else {
          result = 'ball'
        }

        pitchNum++
        pitchDots = [
          ...pitchDots.map(d => ({ ...d, isLatest: false })),
          { num: pitchNum, zoneX: left, zoneY: top, result, isLatest: true },
        ]
        break
      }

      case 'at_bat_result': {
        const p = ev.payload as { result: AtBatResult; ball_type?: BallType }
        // pickoff_out / caught_stealing 아웃 카운트는 각각 pickoff_result / steal_result 에서 처리
        if (['strikeout', 'out', 'double_play', 'fielders_choice'].includes(p.result)) {
          outs++
        }
        lastAtBatResult   = p.result
        lastAtBatBallType = p.ball_type ?? null
        // 타자 인덱스 진행
        if (ev.isTop) awayBatterIdx = (awayBatterIdx + 1) % 9
        else          homeBatterIdx = (homeBatterIdx + 1) % 9
        // 타석 종료 → 초기화
        pitchDots = []
        pitchNum  = 0
        count     = { balls: 0, strikes: 0 }
        break
      }

      case 'runner_advance': {
        const p = ev.payload as {
          moves: Array<{ runner: Player; from: 1|2|3|'batter'; to: 1|2|3|'home'; wasOut?: boolean }>
        }
        const r = { ...runners }
        for (const move of p.moves) {
          if (move.from === 1) r.first  = false
          if (move.from === 2) r.second = false
          if (move.from === 3) r.third  = false
        }
        for (const move of p.moves) {
          if (move.wasOut) continue  // 아웃된 주자의 도착 베이스는 점유하지 않음
          if (move.to === 1) r.first  = true
          if (move.to === 2) r.second = true
          if (move.to === 3) r.third  = true
        }
        runners = r
        animEvents.push({
          type:  'runner_advance',
          moves: p.moves.map(m => ({ from: m.from, to: m.to, wasOut: m.wasOut })),
        })
        break
      }

      case 'score': {
        const p = ev.payload as { runs_total_home: number; runs_total_away: number }
        score = { home: p.runs_total_home, away: p.runs_total_away }
        break
      }

      case 'pitching_change': {
        const p = ev.payload as { incoming: Player }
        if (ev.isTop) currentHomePitcher = p.incoming
        else          currentAwayPitcher = p.incoming
        break
      }

      case 'steal_result': {
        const p = ev.payload as { runner: Player; from: 1|2; to: 2|3|'home'; success: boolean }
        if (!p.success) outs++
        animEvents.push({ type: 'steal_result', from: p.from, to: p.to, success: p.success })
        break
      }

      case 'pickoff_result': {
        const p = ev.payload as { out: boolean }
        if (p.out) outs++
        break
      }

      case 'tag_up': {
        const p = ev.payload as { runner: Player; from: 1|2|3; to: 1|2|3|'home'; safe: boolean }
        animEvents.push({ type: 'tag_up', from: p.from, to: p.to, safe: p.safe })
        break
      }
    }
  }

  const battingLineup = isTop ? awayLineup : homeLineup
  const batterIdx     = isTop ? awayBatterIdx : homeBatterIdx
  const currentBatter = battingLineup[batterIdx]
  const onDeck        = battingLineup[(batterIdx + 1) % 9]
  const currentPitcher = isTop ? currentHomePitcher : currentAwayPitcher

  return {
    score,
    inning,
    isTop,
    outs,
    runners,
    count,
    currentPitcher,
    currentBatter,
    onDeck,
    pitchDots,
    animEvents,
    animSeq: animEvents.length,
    lastAtBatResult,
    lastAtBatBallType,
  }
}
