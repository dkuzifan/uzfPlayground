// ============================================================
// Baseball Player Types
// ============================================================

export type Position =
  | 'P'    // 투수
  | 'C'    // 포수
  | '1B'   // 1루수
  | '2B'   // 2루수
  | '3B'   // 3루수
  | 'SS'   // 유격수
  | 'LF'   // 좌익수
  | 'CF'   // 중견수
  | 'RF'   // 우익수
  | 'DH'   // 지명타자
  | 'UTIL' // 유틸리티

export type PitchType =
  | 'fastball'
  | 'sinker'
  | 'cutter'
  | 'slider'
  | 'curveball'
  | 'changeup'
  | 'splitter'
  | 'forkball'

export type Handedness = 'L' | 'R' | 'S' // S = 스위치(양타)

// 구종별 스탯 (투수 전용)
export interface PitchTypeData {
  type: PitchType
  weight: number       // 구사 비율 (팀 합계 = 100)
  ball_power: number   // 구위 30~100
  ball_control: number // 제구 30~100
  ball_break: number   // 변화 30~100
  ball_speed: number   // 구속 30~100
}

// 선수 스탯
export interface PlayerStats {
  // 투수 전용 — pitch_types 가중 평균 (표시/비교용)
  ball_power: number
  ball_control: number
  ball_break: number
  ball_speed: number
  // 타자 전용
  contact: number
  power: number
  defence: number
  throw: number
  running: number
  // 공통 (투수/타자 모두)
  stamina: number
}

export interface Player {
  id: string
  team_id: string
  name: string
  number: number
  age: number
  bats: Handedness
  throws: Handedness
  position_1: Position
  position_2: Position | null
  position_3: Position | null
  stats: PlayerStats
  pitch_types: PitchTypeData[] // 비투수는 []
  zone_bottom: number          // 스트라이크 존 하단 (m)
  zone_top: number             // 스트라이크 존 상단 (m)
  portrait_url: string | null
}

export interface Team {
  id: string
  name: string
  short_name: string
  primary_color: string
  players: Player[]
}

// ============================================================
// Utilities
// ============================================================

const FIELDER_POSITIONS: Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'UTIL']

/**
 * 투웨이 선수 판별 — position_1/2/3 중 'P'와 야수 포지션이 모두 있으면 true
 */
export function is_two_way(player: Player): boolean {
  const positions = [player.position_1, player.position_2, player.position_3].filter(Boolean) as Position[]
  return positions.includes('P') && positions.some(p => FIELDER_POSITIONS.includes(p))
}

/**
 * 구종별 가중 평균으로 투수 전체 스탯 산출
 * 비투수(빈 배열) 호출 시 0 반환
 */
export function calcPitcherStats(
  pitchTypes: PitchTypeData[]
): Pick<PlayerStats, 'ball_power' | 'ball_control' | 'ball_break' | 'ball_speed'> {
  if (pitchTypes.length === 0) {
    return { ball_power: 0, ball_control: 0, ball_break: 0, ball_speed: 0 }
  }

  const totalWeight = pitchTypes.reduce((sum, p) => sum + p.weight, 0)

  return {
    ball_power:   pitchTypes.reduce((sum, p) => sum + p.ball_power   * p.weight, 0) / totalWeight,
    ball_control: pitchTypes.reduce((sum, p) => sum + p.ball_control * p.weight, 0) / totalWeight,
    ball_break:   pitchTypes.reduce((sum, p) => sum + p.ball_break   * p.weight, 0) / totalWeight,
    ball_speed:   pitchTypes.reduce((sum, p) => sum + p.ball_speed   * p.weight, 0) / totalWeight,
  }
}
