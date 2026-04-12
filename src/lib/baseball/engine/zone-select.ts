import type { PitchType, Player } from '../types/player'
import type { ZoneId, GamePitchState } from './types'
import type { ApproachResult } from './pitcher-ai'
import {
  PITCH_AFFINITY,
  SEQUENCE_MODIFIER,
  BASE_DISTANCE,
  MAX_SPEED,
  ZONE_SELECT_STRIKE_BASE,
  ZONE_SELECT_CORE_PENALTY,
  ZONE_SELECT_CHASE_BONUS,
  POWER_CAUTION,
  type ZoneCategory,
} from './config'

// 7×7 그리드의 모든 존 ID 목록 (49개)
const ALL_ZONES: ZoneId[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9,
  'Z00', 'Z01', 'Z02', 'Z03', 'Z04', 'Z05', 'Z06',
  'Z10', 'Z11', 'Z12', 'Z13', 'Z14', 'Z15', 'Z16',
  'Z20', 'Z21', 'Z25', 'Z26',
  'Z30', 'Z31', 'Z35', 'Z36',
  'Z40', 'Z41', 'Z45', 'Z46',
  'Z50', 'Z51', 'Z52', 'Z53', 'Z54', 'Z55', 'Z56',
  'Z60', 'Z61', 'Z62', 'Z63', 'Z64', 'Z65', 'Z66',
]

// 스트라이크 존만 (Step 9 — balls=3 카운트에서 사용)
const STRIKE_ZONES: ZoneId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]

// 볼존 판별
const BALL_ZONES = new Set<ZoneId>(ALL_ZONES.filter(z => typeof z === 'string'))

// core 존 (한복판): 1개
const CORE_ZONES = new Set<ZoneId>([5])
// mid 존 (십자): 4개
const MID_ZONES = new Set<ZoneId>([2, 4, 6, 8])
// edge 존 (코너): 4개
const EDGE_ZONES = new Set<ZoneId>([1, 3, 7, 9])
// chase 존 (스트라이크 존 1칸 인접, 대각 포함)
const CHASE_ZONES = new Set<ZoneId>([
  'Z11', 'Z12', 'Z13', 'Z14', 'Z15',
  'Z21', 'Z25',
  'Z31', 'Z35',
  'Z41', 'Z45',
  'Z51', 'Z52', 'Z53', 'Z54', 'Z55',
])

// 인코스/아웃코스 분류 (우타자 기준, col 기반)
// col 0~2 = 좌(인코스), col 4~6 = 우(아웃코스)
const INSIDE_ZONES = new Set<ZoneId>([
  1, 4, 7,
  'Z00', 'Z01', 'Z02', 'Z10', 'Z11', 'Z12',
  'Z20', 'Z21', 'Z30', 'Z31', 'Z40', 'Z41',
  'Z50', 'Z51', 'Z52', 'Z60', 'Z61', 'Z62',
])
const OUTSIDE_ZONES = new Set<ZoneId>([
  3, 6, 9,
  'Z04', 'Z05', 'Z06', 'Z14', 'Z15', 'Z16',
  'Z25', 'Z26', 'Z35', 'Z36', 'Z45', 'Z46',
  'Z54', 'Z55', 'Z56', 'Z64', 'Z65', 'Z66',
])
const HIGH_ZONES = new Set<ZoneId>([
  1, 2, 3,
  'Z00', 'Z01', 'Z02', 'Z03', 'Z04', 'Z05', 'Z06',
  'Z10', 'Z11', 'Z12', 'Z13', 'Z14', 'Z15', 'Z16',
  'Z20', 'Z21', 'Z25', 'Z26',
])
const LOW_ZONES = new Set<ZoneId>([
  7, 8, 9,
  'Z40', 'Z41', 'Z45', 'Z46',
  'Z50', 'Z51', 'Z52', 'Z53', 'Z54', 'Z55', 'Z56',
  'Z60', 'Z61', 'Z62', 'Z63', 'Z64', 'Z65', 'Z66',
])

// 존 → 카테고리 매핑
function zoneCategory(zone: ZoneId): ZoneCategory {
  if (CORE_ZONES.has(zone)) return 'core'
  if (MID_ZONES.has(zone)) return 'mid'
  if (EDGE_ZONES.has(zone)) return 'edge'
  if (CHASE_ZONES.has(zone)) return 'chase'
  return 'ball'
}

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
// Step 8: 타자 Power 기반 조심도 (Carry 그래프)
// ============================================================

function calcPowerCaution(batterPower: number, pitchBallPower: number): number {
  const carry = batterPower - pitchBallPower
  const bps = POWER_CAUTION.breakpoints
  if (carry <= bps[0].carry) return bps[0].caution
  if (carry >= bps[bps.length - 1].carry) return bps[bps.length - 1].caution
  for (let i = 0; i < bps.length - 1; i++) {
    const a = bps[i], b = bps[i + 1]
    if (carry >= a.carry && carry <= b.carry) {
      const t = (carry - a.carry) / (b.carry - a.carry)
      return a.caution + t * (b.caution - a.caution)
    }
  }
  return 0
}

// ============================================================
// M4: 코스 선택 + delivery_time 계산 (Step 5 — approach 기반)
// ============================================================

// 타자 몸쪽 볼존 (우타: 좌측 col 0~1, 좌타: 우측 col 5~6)
const INSIDE_BALL_R = new Set<ZoneId>([
  'Z00', 'Z01', 'Z10', 'Z11', 'Z20', 'Z21', 'Z30', 'Z31', 'Z40', 'Z41', 'Z50', 'Z51', 'Z60', 'Z61',
])
const INSIDE_BALL_L = new Set<ZoneId>([
  'Z05', 'Z06', 'Z15', 'Z16', 'Z25', 'Z26', 'Z35', 'Z36', 'Z45', 'Z46', 'Z55', 'Z56', 'Z65', 'Z66',
])

// 인코스 볼존 보너스 감소 비율 (HBP 리스크 완화)
const INSIDE_BALL_CHASE_RATIO = 0.5

export interface ZoneSelectOpts {
  // Step 9 — balls=3 카운트에서 스트라이크 존만 후보로 제한
  strikeZoneOnly?: boolean
  // Step 9 — 3-0 전용: core/mid 선호, edge 억제
  threeZeroBias?: boolean
}

export function selectTargetZone(
  pitcher: GamePitchState['pitcher'],
  pitchType: PitchType,
  batter: Player,
  recentPitches: GamePitchState['recent_pitches'],
  approach: ApproachResult,
  opts: ZoneSelectOpts = {},
): { zone: ZoneId; delivery_time: number } {
  const affinity = PITCH_AFFINITY[pitchType]
  const batterBats = batter.bats
  const insideBallZones = batterBats === 'L' ? INSIDE_BALL_L : INSIDE_BALL_R

  // 이전 구 정보
  const prev = recentPitches[recentPitches.length - 1]

  // ---- 타자 Power 조심도 (Step 8) ----
  const pitchData = pitcher.pitch_types.find(pt => pt.type === pitchType)
  const pitchBallPower = pitchData?.ball_power ?? 50
  const batterPower = batter.stats.power ?? 50
  const caution = calcPowerCaution(batterPower, pitchBallPower)
  const ze = POWER_CAUTION.zone_effect

  // Step 9 — 스트라이크 존 제한 (balls=3 계열)
  const zoneCandidates = opts.strikeZoneOnly ? STRIKE_ZONES : ALL_ZONES

  const weights = zoneCandidates.map(zone => {
    // ---- 스트라이크 존 기본 가중치 보정 (카테고리별 뼈대) ----
    let strikeBase: number
    if (BALL_ZONES.has(zone)) {
      if (CHASE_ZONES.has(zone)) {
        // chase 존 중 타자 몸쪽이면 보너스 감소
        const isInside = insideBallZones.has(zone)
        strikeBase = isInside
          ? 1.0 + (ZONE_SELECT_CHASE_BONUS - 1.0) * INSIDE_BALL_CHASE_RATIO
          : ZONE_SELECT_CHASE_BONUS
      } else {
        strikeBase = 1.0
      }
    } else if (CORE_ZONES.has(zone)) {
      strikeBase = ZONE_SELECT_STRIKE_BASE * ZONE_SELECT_CORE_PENALTY
    } else if (MID_ZONES.has(zone)) {
      strikeBase = ZONE_SELECT_STRIKE_BASE * 0.7
    } else {
      strikeBase = ZONE_SELECT_STRIKE_BASE  // edge
    }
    let w = (affinity[zone] ?? 1.0) * strikeBase

    // ---- Step 5: approach zone_bias (COUNT_STATE_BIAS × PITCH_STRATEGY 대체) ----
    const cat = zoneCategory(zone)
    w *= approach.zone_bias[cat]

    // ---- Step 5: approach direction_bias ----
    if (HIGH_ZONES.has(zone))    w *= approach.direction_bias.high
    if (LOW_ZONES.has(zone))     w *= approach.direction_bias.low
    if (INSIDE_ZONES.has(zone))  w *= approach.direction_bias.inside
    if (OUTSIDE_ZONES.has(zone)) w *= approach.direction_bias.outside

    // ---- Step 9: 3-0 전용 바이어스 (한복판/십자 선호, 코너 억제) ----
    if (opts.threeZeroBias) {
      if (cat === 'core')      w *= 2.0
      else if (cat === 'mid')  w *= 1.5
      else if (cat === 'edge') w *= 0.6
    }

    // ---- Step 8: 타자 Power 조심도 보정 ----
    if (caution > 0) {
      if (HIGH_ZONES.has(zone))  w *= (1 + ze.high_avoid  * caution)
      if (CORE_ZONES.has(zone))  w *= (1 + ze.core_avoid  * caution)
      if (MID_ZONES.has(zone))   w *= (1 + ze.mid_avoid   * caution)
      if (LOW_ZONES.has(zone))   w *= (1 + ze.low_prefer  * caution)
    }

    // ---- Sequence Modifier (일반 위치 변화 선호 — 항상 적용) ----
    if (prev) {
      const prevInside  = INSIDE_ZONES.has(prev.zone)
      const prevOutside = OUTSIDE_ZONES.has(prev.zone)
      const prevHigh    = HIGH_ZONES.has(prev.zone)
      const prevLow     = LOW_ZONES.has(prev.zone)

      if (prevInside  && OUTSIDE_ZONES.has(zone)) w *= SEQUENCE_MODIFIER.prev_inside_to_outside
      if (prevOutside && INSIDE_ZONES.has(zone))  w *= SEQUENCE_MODIFIER.prev_outside_to_inside
      if (prevHigh    && LOW_ZONES.has(zone))     w *= SEQUENCE_MODIFIER.prev_high_to_low
      if (prevLow     && HIGH_ZONES.has(zone))    w *= SEQUENCE_MODIFIER.prev_low_to_high
    }

    return Math.max(w, 0)
  })

  const zone = weightedRandom(zoneCandidates, weights)

  // delivery_time: BASE_DISTANCE / (ball_speed / 100 × MAX_SPEED)
  const ballSpeed = pitchData?.ball_speed ?? 70
  const delivery_time = BASE_DISTANCE / ((ballSpeed / 100) * MAX_SPEED)

  return { zone, delivery_time }
}
