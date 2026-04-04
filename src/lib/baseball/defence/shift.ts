import type { Player, Position } from '../types/player'
import { FIELDER_DEFAULT_POS } from './fielder-positions'

// ============================================================
// 시프트 이벤트 payload 타입
// ============================================================

export interface ShiftedPosition {
  position: Position
  from:     { x: number; y: number }
  to:       { x: number; y: number }
}

export interface ShiftEvent {
  direction:         'left' | 'right'
  pull_tendency:     number
  shifted_positions: ShiftedPosition[]
}

// ============================================================
// 포지션별 스케일 계수
//
// 내야: dx_scale (부호 반전으로 LHB/RHB 대응)
//   shift_x_delta 범위: -0.25 ~ +0.25
//   LHB (sign=+1): dx = dx_scale * shift_x_delta (+방향 = 1루 쪽)
//   RHB (sign=-1): dx = dx_scale * shift_x_delta * -1
//
// 외야: dx_scale_L / dx_scale_R 별도 정의
//   LHB → 1루/RF 방향으로 이동, LF가 가장 멀어 최대 이동
//   RHB → 3루/LF 방향으로 이동, RF가 가장 멀어 최대 이동
//
// dy_scale: depth_delta 범위 -1.0 ~ +1.0
//   양수 = 홈플레이트에서 멀어짐 (외야 방향)
// ============================================================

interface InfieldScale {
  dx_scale: number
  dy_scale: number
}

interface OutfieldScale {
  dx_scale_L: number   // LHB 시프트 (공이 1루/RF 방향)
  dx_scale_R: number   // RHB 시프트 (공이 3루/LF 방향)
  dy_scale:   number
}

const INFIELD_SCALE: Partial<Record<Position, InfieldScale>> = {
  SS:   { dx_scale: 52, dy_scale: 4 },
  '2B': { dx_scale: 44, dy_scale: 4 },
  '3B': { dx_scale: 44, dy_scale: 4 },
  '1B': { dx_scale:  0, dy_scale: 4 },  // dx 앵커
}

const OUTFIELD_SCALE: Partial<Record<Position, OutfieldScale>> = {
  LF: { dx_scale_L: 72, dx_scale_R: -20, dy_scale: 6 },
  CF: { dx_scale_L: 48, dx_scale_R: -48, dy_scale: 6 },
  RF: { dx_scale_L: 20, dx_scale_R: -72, dy_scale: 6 },
}

// ============================================================
// calcPullTendency — power → pull_tendency (0.0~1.0)
//
// power 50 → 0.45 (중립, 오프셋 없음)
// power 100 → 0.70 (최대 시프트)
// pull_tendency - 0.45 = shift_x_delta (범위 -0.25 ~ +0.25)
// ============================================================

export function calcPullTendency(power: number): number {
  const pull_delta = (power - 50) / 50
  return Math.max(0.0, Math.min(1.0, 0.45 + pull_delta * 0.25))
}

// ============================================================
// resolveEffectiveBats — 스위치히터의 실제 타석 방향 결정
//
// bats='S': 우투수 → 좌타석('L'), 좌투수 → 우타석('R')
// 비스위치히터: bats 그대로
// ============================================================

export function resolveEffectiveBats(batter: Player, pitcher: Player): 'L' | 'R' {
  if (batter.bats !== 'S') return batter.bats as 'L' | 'R'
  return pitcher.throws === 'R' ? 'L' : 'R'
}

// ============================================================
// applyShift — 타석 단위 수비 라인업 시프트 적용
//
// 원본 lineup 불변 — spread 복사 후 defence_pos만 오버라이드.
// C, P는 스케일 정의 없음 → 변경 없이 복사.
// ============================================================

export function applyShift(
  lineup:  Player[],
  batter:  Player,
  pitcher: Player,
): { shiftedLineup: Player[]; event: ShiftEvent } {
  const effectiveBats  = resolveEffectiveBats(batter, pitcher)
  const pull_tendency  = calcPullTendency(batter.stats.power)
  const shift_x_delta  = pull_tendency - 0.45            // -0.25 ~ +0.25
  const depth_delta    = (batter.stats.power - 50) / 50  // -1.0  ~ +1.0
  const direction: 'left' | 'right' = effectiveBats === 'L' ? 'right' : 'left'

  const shifted_positions: ShiftedPosition[] = []
  const shiftedLineup: Player[] = lineup.map(player => {
    const pos       = player.position_1
    const defaultXY = player.defence_pos ?? FIELDER_DEFAULT_POS[pos]
    if (!defaultXY) return { ...player }

    const infield  = INFIELD_SCALE[pos]
    const outfield = OUTFIELD_SCALE[pos]

    let dx = 0
    let dy = 0

    if (infield) {
      const sign = effectiveBats === 'L' ? 1 : -1
      dx = infield.dx_scale * shift_x_delta * sign
      dy = infield.dy_scale * depth_delta
    } else if (outfield) {
      dx = (effectiveBats === 'L' ? outfield.dx_scale_L : outfield.dx_scale_R) * shift_x_delta
      dy = outfield.dy_scale * depth_delta
    } else {
      // C, P 등 비대상 — 변경 없음
      return { ...player }
    }

    const from = { x: defaultXY.x,      y: defaultXY.y }
    const to   = { x: defaultXY.x + dx, y: defaultXY.y + dy }

    if (dx !== 0 || dy !== 0) {
      shifted_positions.push({ position: pos, from, to })
    }

    return { ...player, defence_pos: to }
  })

  return {
    shiftedLineup,
    event: { direction, pull_tendency, shifted_positions },
  }
}
