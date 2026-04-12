import type { Player } from '../types/player'
import type { ZoneId, GamePitchState } from './types'
import {
  classifyCount,
  type PitcherGoal,
  type Approach,
  type ZoneCategory,
  type SpeedTier,
  PITCHER_AI_CONFIG,
  GOAL_APPROACH_WEIGHTS,
  APPROACH_ZONE_BIAS,
  APPROACH_DIRECTION_BIAS,
  APPROACH_PITCH_PREF,
  PITCH_SPEED_TIER,
} from './config'

// ============================================================
// Step 5 — 목표 기반 투수 AI
//
// 흐름: decidePitcherGoal → selectApproach → ApproachResult
// ApproachResult가 구종 선택(pitch_tier_bias)과 존 선택(zone_bias, direction_bias)을 결정
// ============================================================

// ---- 투수 성향 (기존 스탯에서 도출) ----

export interface PitcherTendency {
  precision:   number   // ball_control / 100 — 코너 공략 선호
  power_style: number   // ball_power / 100 — 밀어붙이기 선호
  movement:    number   // ball_break / 100 — 유인구 활용
  velocity:    number   // ball_speed / 100 — 하이 패스트볼
  deception:   number   // 보유 구종 최대 속도차 / 20 — 속도 차 활용
}

export interface ApproachResult {
  goal:            PitcherGoal
  approach:        Approach
  zone_bias:       Record<ZoneCategory, number>
  direction_bias:  { high: number; low: number; inside: number; outside: number }
  pitch_tier_bias: Record<SpeedTier, number>
}

// ---- 존 방향 판별 헬퍼 (7×7 그리드, row/col 기반) ----

function zoneRowCol(z: ZoneId): [number, number] {
  if (typeof z === 'number') {
    // 1~9 → row 2~4, col 2~4
    const row = Math.ceil(z / 3) + 1       // 1-3→2, 4-6→3, 7-9→4
    const col = ((z - 1) % 3) + 2          // 1,4,7→2  2,5,8→3  3,6,9→4
    return [row, col]
  }
  // Z{row}{col}
  const r = Number(z[1])
  const c = Number(z[2])
  return [r, c]
}

function isHighZone(z: ZoneId): boolean {
  return zoneRowCol(z)[0] <= 2  // rows 0, 1, 2
}
function isLowZone(z: ZoneId): boolean {
  return zoneRowCol(z)[0] >= 4  // rows 4, 5, 6
}
function isInsideZone(z: ZoneId): boolean {
  return zoneRowCol(z)[1] <= 2  // cols 0, 1, 2
}
function isOutsideZone(z: ZoneId): boolean {
  return zoneRowCol(z)[1] >= 4  // cols 4, 5, 6
}

// ---- 가중치 랜덤 선택 ----

function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

// ============================================================
// 1. 투수 성향 도출
// ============================================================

export function derivePitcherTendency(pitcher: GamePitchState['pitcher']): PitcherTendency {
  const s = pitcher.stats
  const precision   = (s.ball_control ?? 50) / 100
  const power_style = (s.ball_power   ?? 50) / 100
  const movement    = (s.ball_break   ?? 50) / 100
  const velocity    = (s.ball_speed   ?? 50) / 100

  // deception: 보유 구종 중 최대 속도 차이 (0~1)
  const speeds = pitcher.pitch_types.map(pt => pt.ball_speed)
  const speedDiff = speeds.length >= 2
    ? Math.max(...speeds) - Math.min(...speeds)
    : 0
  const deception = Math.min(speedDiff / 20, 1.0)

  return { precision, power_style, movement, velocity, deception }
}

// ============================================================
// 2. Goal 결정
// ============================================================

export function decidePitcherGoal(
  count:   { balls: number; strikes: number },
  outs:    number,
  runners: { first: boolean; second: boolean; third: boolean },
  batter:  Player,
): PitcherGoal {
  const countState = classifyCount(count.balls, count.strikes)

  // behind → safe_strike (스트라이크 존 안 확보)
  if (countState === 'behind') return 'safe_strike'

  // ahead + 강타자 → weak_contact (장타 방지)
  if (countState === 'ahead') {
    if ((batter.stats.power ?? 50) >= PITCHER_AI_CONFIG.weak_contact_power_threshold) {
      return 'weak_contact'
    }
    return 'strikeout'
  }

  // 0-0 → strike_first (스트라이크 선점)
  if (count.balls === 0 && count.strikes === 0) return 'strike_first'

  // neutral, full → explore
  return 'explore'
}

// ============================================================
// 3. Approach 선택 + bias 계산
// ============================================================

export interface SituationModifiers {
  gidpPossible: boolean   // 주자 1루 + 2아웃 미만
  tagUpRisk:    boolean   // 3루 주자 + 2아웃 미만
}

export function selectApproach(
  goal:          PitcherGoal,
  tendency:      PitcherTendency,
  recentPitches: GamePitchState['recent_pitches'],
  situation:     SituationModifiers,
): ApproachResult {
  // ---- approach 선택 확률 계산 ----
  const goalConfig = GOAL_APPROACH_WEIGHTS[goal]
  const approaches: Approach[] = []
  const weights: number[] = []

  for (const [approach, entry] of Object.entries(goalConfig)) {
    approaches.push(approach as Approach)
    const w = entry!.base + tendency[entry!.tendency] * entry!.bonus
    weights.push(Math.max(w, 0.01))
  }

  const selected = weightedRandom(approaches, weights)

  // ---- zone_bias ----
  const baseBias = APPROACH_ZONE_BIAS[selected]
  const zone_bias: Record<ZoneCategory, number> = {
    core:  baseBias.core  ?? 1.0,
    mid:   baseBias.mid   ?? 1.0,
    edge:  baseBias.edge  ?? 1.0,
    chase: baseBias.chase ?? 1.0,
    ball:  baseBias.ball  ?? 1.0,
  }

  // ---- direction_bias ----
  const baseDir = APPROACH_DIRECTION_BIAS[selected]
  const direction_bias = {
    high:    baseDir.high    ?? 1.0,
    low:     baseDir.low     ?? 1.0,
    inside:  baseDir.inside  ?? 1.0,
    outside: baseDir.outside ?? 1.0,
  }

  // ---- pitch_tier_bias ----
  const baseTier = APPROACH_PITCH_PREF[selected]
  const pitch_tier_bias: Record<SpeedTier, number> = {
    fast:     baseTier.fast     ?? 1.0,
    breaking: baseTier.breaking ?? 1.0,
    offspeed: baseTier.offspeed ?? 1.0,
  }

  // ---- 동적 보정: sequence_opposite ----
  if (selected === 'sequence_opposite' && recentPitches.length > 0) {
    const prevZone = recentPitches[recentPitches.length - 1].zone
    if (isHighZone(prevZone))    direction_bias.low     *= 1.5
    if (isLowZone(prevZone))     direction_bias.high    *= 1.5
    if (isInsideZone(prevZone))  direction_bias.outside *= 1.4
    if (isOutsideZone(prevZone)) direction_bias.inside  *= 1.4
  }

  // ---- 동적 보정: mix_speed (이전 구종 반대 속도 계열) ----
  if (selected === 'mix_speed' && recentPitches.length > 0) {
    const prevType = recentPitches[recentPitches.length - 1].type
    const prevTier = PITCH_SPEED_TIER[prevType]
    if (prevTier === 'fast') {
      pitch_tier_bias.offspeed *= 1.5
      pitch_tier_bias.breaking *= 1.3
      pitch_tier_bias.fast     *= 0.5
    } else if (prevTier === 'breaking') {
      pitch_tier_bias.fast     *= 1.5
      pitch_tier_bias.offspeed *= 1.2
      pitch_tier_bias.breaking *= 0.6
    } else { // offspeed
      pitch_tier_bias.fast     *= 1.5
      pitch_tier_bias.breaking *= 1.2
      pitch_tier_bias.offspeed *= 0.6
    }
  }

  // ---- 상황 보정: 병살 / 태그업 ----
  if (situation.gidpPossible || situation.tagUpRisk) {
    zone_bias.chase     *= PITCHER_AI_CONFIG.gidp_low_bonus
    direction_bias.low  *= PITCHER_AI_CONFIG.tagup_low_bonus
    direction_bias.high *= PITCHER_AI_CONFIG.tagup_high_penalty
  }

  return { goal, approach: selected, zone_bias, direction_bias, pitch_tier_bias }
}
