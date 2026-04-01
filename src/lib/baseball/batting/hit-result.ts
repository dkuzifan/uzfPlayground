import type { Player }      from '../types/player'
import type { AtBatResult } from './types'
import {
  selectDirectionAngle,
  calcBattedBallPhysics,
  classifyBallType,
} from '../defence/ball-physics'
import {
  findResponsibleFielder,
  calcCatchProbability,
} from '../defence/catch-probability'

// ============================================================
// 상수
// ============================================================

const FENCE_DISTANCE = 120  // m (구장별 override는 N1 피처에서 처리)

// ============================================================
// 거리 기반 히트 종류 결정
// ============================================================

function resolveHitType(
  range: number,
): Exclude<AtBatResult, 'in_progress' | 'strikeout' | 'walk' | 'hit_by_pitch' | 'home_run' | 'out'> {
  // range < 36m: 내야 → 단타
  if (range < 36) return 'single'

  // 36m ≤ range < 70m: 외야 얕은 타구
  if (range < 70) {
    return Math.random() < 0.70 ? 'single' : 'double'
  }

  // range ≥ 70m: 깊은 외야 (주루 스탯 반영은 #2 송구 판정 이후 고도화 예정)
  const r = Math.random()
  if (r < 0.30) return 'single'
  if (r < 0.90) return 'double'
  return 'triple'
}

// ============================================================
// M7: 타구 결과 판정
// 수비수 위치 + Defence 스탯 + 타구 물리 기반
// ============================================================

export function resolveHitResult(
  exit_velocity: number,
  launch_angle:  number,
  batter:        Player,
  fielders:      Player[],
): Exclude<AtBatResult, 'in_progress' | 'strikeout' | 'walk' | 'hit_by_pitch'> {
  // 1. 방향각 결정
  const theta_h = selectDirectionAngle(batter)

  // 2. 타구 물리 계산
  const physics = calcBattedBallPhysics(exit_velocity, launch_angle, theta_h)

  // 3. 홈런 판정
  if (physics.range >= FENCE_DISTANCE) return 'home_run'

  // 4. 타구 종류 분류
  const ballType = classifyBallType(launch_angle)

  // 5. 담당 수비수 선택
  const { fielder, dist } = findResponsibleFielder(physics.landing, fielders)

  // 6. 포구 확률 계산
  const p_out = calcCatchProbability(ballType, dist, physics.v_roll_0, fielder)

  // 7. 아웃 판정
  if (Math.random() < p_out) return 'out'

  // 8. 히트 종류 결정 (거리 기반)
  return resolveHitType(physics.range)
}
