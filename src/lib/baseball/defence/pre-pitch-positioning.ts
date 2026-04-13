import type { Player } from '../types/player'
import { FIELDER_DEFAULT_POS } from './fielder-positions'

// ============================================================
// 사전 수비 포지셔닝 — corners-in (희생번트 대비)
//
// 수비팀이 "희생번트가 올 것 같다"고 판단하면 1B·3B가 평소보다
// 몇 m 앞으로 전진. 기습번트는 정의상 기습이므로 대상 아님.
//
// applyShift 의 결과에 chain — defence_pos 를 한 번 더 override.
// Player.defence_pos 필드를 그대로 활용해서 기존 포구 로직이
// 수정 없이 전진 위치를 자동 참조.
// ============================================================

import type { BattingState } from '../batting/types'

// ============================================================
// 계수
// ============================================================

const CORNERS_IN_CONFIG = {
  // 희생번트 예상 임계값 — 이 이상이면 전진 적용
  threshold: 0.25,
  // 최대 전진 거리 (m) — 홈플레이트 방향
  max_advance_y: 6,
  // likelihood 배수 (0~1) × max_advance_y
  // threshold 에서 0, 1.0 에서 max_advance_y 적용
} as const

// ============================================================
// calcSacrificeBuntLikelihood — 수비팀 시점의 "희생번트 예상도"
//
// decideBunt() 의 희생번트 경로와 동일한 조건·가중치를 쓰되,
// 확률 롤은 하지 않고 정규화된 0~1 점수를 반환.
// ============================================================

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x))
}

export function calcSacrificeBuntLikelihood(
  batter:  Player,
  runners: BattingState['runners'],
  outs:    number,
  count:   BattingState['count'],
  inning:  number,
  scoreDiff: number,
): number {
  // 게이트: 하나라도 불만족이면 0
  if (count.strikes >= 2) return 0
  if (outs >= 2) return 0
  if (!runners.first && !runners.second) return 0
  if (scoreDiff > 2 || scoreDiff < -4) return 0
  if (!(inning >= 7 || inning === 1)) return 0

  // 상황 점수
  let situation = 0.30
  if (runners.first && runners.second) situation += 0.15
  if (scoreDiff === 0 || scoreDiff === -1) situation += 0.10
  if (inning >= 9 && Math.abs(scoreDiff) <= 1) situation += 0.10

  // 타자 적합성 (stat_multiplier 와 같은 공식)
  const c = batter.stats.contact
  const p = batter.stats.power
  const e = batter.stats.eye ?? 50
  const r = batter.stats.running

  const contactFactor = clamp((65 - c) / 40, -0.5, +0.5)
  const powerFactor   = clamp((60 - p) / 50, -0.4, +0.4)
  const eyeFactor     = clamp((60 - e) / 80, -0.2, +0.2)
  const runningFactor = clamp((50 - r) / 100, -0.15, +0.1)

  const multiplier = clamp(
    1 + contactFactor + powerFactor + eyeFactor + runningFactor,
    0.10, 2.00,
  )

  // 0~1 정규화: situation * multiplier 의 이론 최대값은 ~1.2
  // 실제 결정(decideBunt)에서 쓰는 최대 확률은 ~0.6 이므로 0.6 을 1.0 으로 맵핑
  const rawScore = situation * multiplier
  return clamp(rawScore / 0.6, 0, 1)
}

// ============================================================
// applyCornersIn — 1B·3B 전진 override
//
// 기존 lineup 불변 — spread 복사. applyShift 결과를 입력받아
// 그 위에 corners-in 을 덧씌운다.
// ============================================================

export interface CornersInEvent {
  likelihood: number
  advanced:   Array<{ position: '1B' | '3B'; from_y: number; to_y: number }>
}

export function applyCornersIn(
  shiftedLineup: Player[],
  likelihood:    number,
): { lineup: Player[]; event: CornersInEvent | null } {
  if (likelihood < CORNERS_IN_CONFIG.threshold) {
    return { lineup: shiftedLineup, event: null }
  }

  // threshold~1.0 을 0~1 로 리매핑 후 max_advance_y 곱함
  const strength = (likelihood - CORNERS_IN_CONFIG.threshold) / (1 - CORNERS_IN_CONFIG.threshold)
  const advance_y = strength * CORNERS_IN_CONFIG.max_advance_y

  const advanced: CornersInEvent['advanced'] = []
  const newLineup = shiftedLineup.map(player => {
    if (player.position_1 !== '1B' && player.position_1 !== '3B') {
      return player
    }

    const current = player.defence_pos
      ?? FIELDER_DEFAULT_POS[player.position_1]
      ?? { x: 0, y: 24 }

    const newPos = { x: current.x, y: current.y - advance_y }
    advanced.push({
      position: player.position_1,
      from_y:   current.y,
      to_y:     newPos.y,
    })
    return { ...player, defence_pos: newPos }
  })

  return {
    lineup: newLineup,
    event:  { likelihood, advanced },
  }
}
