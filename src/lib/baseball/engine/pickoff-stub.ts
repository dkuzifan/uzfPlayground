import type { GamePitchState } from './types'

// ============================================================
// M3: 견제 결정 (stub)
// 견제 피처 구현 시 이 함수를 교체하고 attempt: true 분기 처리를 추가
// ============================================================

export function decidePickoff(
  _pitcher: GamePitchState['pitcher'],
  _runners: GamePitchState['runners'],
  _situation: Pick<GamePitchState, 'count' | 'inning'>
): { attempt: false } {
  return { attempt: false }
}
