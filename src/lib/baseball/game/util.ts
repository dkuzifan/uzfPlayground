import type { Player } from '../types/player'

/**
 * lineup에서 포수(C)를 찾아 반환합니다.
 * 포수가 없으면 lineup[1] (2번 타자)을 fallback으로 사용합니다.
 */
export function findCatcher(lineup: Player[]): Player {
  return lineup.find(p => p.position_1 === 'C') ?? lineup[1]
}
