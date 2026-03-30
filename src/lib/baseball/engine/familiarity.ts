import type { PitchType } from '../types/player'
import type { ZoneId, FamiliarityMap } from './types'
import { FAMILIARITY_DECAY, FAMILIARITY_INC } from './config'

// ============================================================
// M8: 익숙함 추적 및 감쇠
// 불변 — 모두 새 맵 반환
// ============================================================

export function updateFamiliarity(
  current: FamiliarityMap,
  pitchType: PitchType,
  zone: ZoneId
): FamiliarityMap {
  const zoneKey = String(zone)
  const prevZoneMap = current[pitchType] ?? {}
  const prevVal     = prevZoneMap[zoneKey] ?? 0

  return {
    ...current,
    [pitchType]: {
      ...prevZoneMap,
      [zoneKey]: Math.min(prevVal + FAMILIARITY_INC, 1),
    },
  }
}

// 타석 종료 시 호출 — 모든 값 × FAMILIARITY_DECAY (잔존율 20%)
export function decayFamiliarity(current: FamiliarityMap): FamiliarityMap {
  const result: FamiliarityMap = {}
  for (const [pitchType, zoneMap] of Object.entries(current) as [PitchType, Record<string, number>][]) {
    const decayed: Record<string, number> = {}
    for (const [zone, val] of Object.entries(zoneMap)) {
      decayed[zone] = val * FAMILIARITY_DECAY
    }
    result[pitchType] = decayed
  }
  return result
}
