import type { BattingState } from './types'

// ============================================================
// M2: 번트 결정 (stub)
// 번트 피처 구현 시 이 함수를 교체하고 attempt: true 분기 처리를 추가
// ============================================================

export function decideBunt(
  _batter: BattingState['batter'],
  _count: BattingState['count'],
  _runners: BattingState['runners'],
  _situation: Pick<BattingState, 'outs' | 'inning'>
): { attempt: false } {
  return { attempt: false }
}
