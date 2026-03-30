import type { PitchType } from '../types/player'
import type { ZoneId, GamePitchState } from './types'
import {
  PITCH_AFFINITY,
  COUNT_MODIFIER,
  SEQUENCE_MODIFIER,
  BASE_DISTANCE,
  MAX_SPEED,
  ZONE_SELECT_STRIKE_BASE,
} from './config'

// 5×5 그리드의 모든 존 ID 목록
const ALL_ZONES: ZoneId[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9,
  'B11', 'B12', 'B13', 'B14', 'B15',
  'B21', 'B22', 'B23', 'B24', 'B25', 'B26',
  'B31', 'B32', 'B33', 'B34', 'B35',
]

// 볼존 판별
const BALL_ZONES = new Set<ZoneId>([
  'B11', 'B12', 'B13', 'B14', 'B15',
  'B21', 'B22', 'B23', 'B24', 'B25', 'B26',
  'B31', 'B32', 'B33', 'B34', 'B35',
])

// 낙하계 존 (change of eye level: 높은 → 낮은 이동 선호)
const NATURAL_FALL_ZONES = new Set<ZoneId>([7, 8, 9, 'B31', 'B32', 'B33', 'B34', 'B35'])
const DIRT_ZONES         = new Set<ZoneId>(['B31', 'B32', 'B33', 'B34', 'B35'])

// 인코스/아웃코스 분류 (우타자 기준)
const INSIDE_ZONES  = new Set<ZoneId>([1, 4, 7, 'B21'])
const OUTSIDE_ZONES = new Set<ZoneId>([3, 6, 9, 'B23', 'B24', 'B25', 'B26'])
const HIGH_ZONES    = new Set<ZoneId>([1, 2, 3, 'B11', 'B12', 'B13', 'B14', 'B15'])
const LOW_ZONES     = new Set<ZoneId>([7, 8, 9, 'B31', 'B32', 'B33', 'B34', 'B35'])

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
// M4: 코스 선택 + delivery_time 계산
// ============================================================

export function selectTargetZone(
  pitcher: GamePitchState['pitcher'],
  pitchType: PitchType,
  count: GamePitchState['count'],
  recentPitches: GamePitchState['recent_pitches']
): { zone: ZoneId; delivery_time: number } {
  const affinity = PITCH_AFFINITY[pitchType]

  // 이전 구 정보
  const prev = recentPitches[recentPitches.length - 1]

  const weights = ALL_ZONES.map(zone => {
    // 스트라이크 존 기본 가중치 보정 (9 strike vs 16 ball → ~63% strike rate)
    const strikeBase = BALL_ZONES.has(zone) ? 1.0 : ZONE_SELECT_STRIKE_BASE
    let w = (affinity[zone] ?? 1.0) * strikeBase

    // Count Modifier
    const balls    = count.balls
    const strikes  = count.strikes
    const isBall   = BALL_ZONES.has(zone)
    const isFall   = NATURAL_FALL_ZONES.has(zone)
    const isDirt   = DIRT_ZONES.has(zone)

    if (balls === 3) {
      // 볼카운트 3: 스트라이크 존 선호, 볼존 억제
      w *= isBall ? COUNT_MODIFIER.behind_3balls.ball_zones : COUNT_MODIFIER.behind_3balls.strike_zones
    } else if (strikes === 2 && balls === 0) {
      if (isFall) w *= COUNT_MODIFIER.ahead_0_2.natural_fall
      if (isDirt) w *= COUNT_MODIFIER.ahead_0_2.dirt
    } else if (strikes === 2 && balls === 1) {
      if (isFall) w *= COUNT_MODIFIER.ahead_1_2.natural_fall
      if (isDirt) w *= COUNT_MODIFIER.ahead_1_2.dirt
    }

    // Sequence Modifier
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

  const zone = weightedRandom(ALL_ZONES, weights)

  // delivery_time: BASE_DISTANCE / (ball_speed / 100 × MAX_SPEED)
  const pitchData = pitcher.pitch_types.find(pt => pt.type === pitchType)
  const ballSpeed = pitchData?.ball_speed ?? 70  // 스펙 미정 시 70 기본
  const delivery_time = BASE_DISTANCE / ((ballSpeed / 100) * MAX_SPEED)

  return { zone, delivery_time }
}
