import type { Position } from '../types/player'

// ============================================================
// 수비수 기본 포지션 좌표
// 원점 = 홈 플레이트, +y = 중견수 방향, +x = 1루 방향
// #7 시프트에서 Player.defence_pos로 오버라이드
// ============================================================

export const FIELDER_DEFAULT_POS: Partial<Record<Position, { x: number; y: number }>> = {
  P:    { x:   0, y:  17 },
  C:    { x:   0, y:  -1 },
  '1B': { x:  11, y:  24 },
  '2B': { x:  10, y:  42 },
  SS:   { x:  -8, y:  42 },
  '3B': { x: -11, y:  24 },
  LF:   { x: -33, y:  73 },  // 실측 기준 ~240ft 코너 외야
  CF:   { x:   0, y:  88 },  // 실측 기준 ~290ft 중견수 중간 수비
  RF:   { x:  33, y:  73 },
}
