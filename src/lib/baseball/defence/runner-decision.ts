import type { Player } from '../types/player'
import type { BallState, Vec2, BaseKey } from './throw-judge'
import {
  BASE_POS,
  euclidDist,
  shouldUseRelay,
  calcRelayPos,
  selectRelayMan,
  resolveThrow,
} from './throw-judge'

// ============================================================
// gaussianNoise — Box-Muller 근사로 N(0, sigma) 샘플링
// ============================================================

function gaussianNoise(sigma: number): number {
  // Box-Muller transform
  const u1 = Math.random()
  const u2 = Math.random()
  const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return z * sigma
}

// ============================================================
// sigmoid — 공통 sigmoid 헬퍼
// ============================================================

function sigmoid(x: number, scale: number): number {
  return 1 / (1 + Math.exp(-x / scale))
}

// ============================================================
// getFielderFromBallState — BallState에서 공을 보유/이동 중인 수비수 추출
// ============================================================

function getFielderFromBallState(bs: BallState): Player {
  switch (bs.phase) {
    case 'in_air':          return bs.fielder
    case 'fielding':        return bs.fielder
    case 'throw_in_flight': return bs.receiver
    case 'held':            return bs.fielder
  }
}

// ============================================================
// getFielderPosFromBallState — BallState에서 수비수 위치 추출
// ============================================================

function getFielderPosFromBallState(bs: BallState): Vec2 {
  switch (bs.phase) {
    case 'in_air':          return bs.fielder_pos
    case 'fielding':        return bs.fielder_pos
    case 'throw_in_flight': return bs.receiver_pos
    case 'held':            return bs.fielder_pos
  }
}

// ============================================================
// calcThrowTime — 수비수 위치 → 목표 베이스까지 송구 소요 시간 (s)
//
// relay 여부를 shouldUseRelay로 판단 후 적절한 시간 반환
// ============================================================

function calcThrowTime(
  fielder:      Player,
  fielder_pos:  Vec2,
  target:       BaseKey,
  lineup:       Player[],
): number {
  const target_pos  = BASE_POS[target]
  const throw_dist  = euclidDist(fielder_pos, target_pos)
  const spd_OF      = (80 + fielder.stats.throw * 0.7) / 3.6
  const relay_man   = selectRelayMan(fielder_pos, lineup)
  const relay_pos   = calcRelayPos(fielder_pos, target_pos)

  const use_relay = shouldUseRelay(fielder, fielder_pos, target_pos, 0, relay_man, relay_pos)

  if (!use_relay) {
    return throw_dist / spd_OF
  }

  // 중계 경로 시간 (t_fielding은 호출자가 이미 반영하므로 여기서는 비행 시간만)
  // 0.8s: resolveRelayThrow의 중계수 반응 시간과 일치 (일관성 유지)
  const spd_relay       = (80 + relay_man.stats.throw * 0.7) / 3.6
  const dist_to_relay   = euclidDist(fielder_pos, relay_pos)
  const dist_relay_to_t = euclidDist(relay_pos, target_pos)
  return dist_to_relay / spd_OF + 0.8 + dist_relay_to_t / spd_relay
}

// ============================================================
// calcBallArrivalTime — BallState를 기반으로 특정 목표 베이스에
// 공이 도달하는 데 걸리는 총 시간 (s)
//
// phase별 계산:
//   fielding        → t_remaining(포구) + 해당 목표로의 송구 시간
//   throw_in_flight → 같은 목표: t_remaining
//                     다른 목표: t_remaining(수신) + 중계 송구 시간
//   held            → 해당 목표로의 송구 시간
//   in_air          → ※ #5 구현 전까지 fielding과 동일하게 처리
// ============================================================

export function calcBallArrivalTime(
  bs:      BallState,
  target:  BaseKey,
  lineup:  Player[],
): number {
  switch (bs.phase) {
    case 'in_air':
    case 'fielding': {
      const throw_time = calcThrowTime(bs.fielder, bs.fielder_pos, target, lineup)
      return bs.t_remaining + throw_time
    }
    case 'throw_in_flight': {
      if (bs.target === target) {
        return bs.t_remaining
      }
      // 다른 목표: 수신 후 relay 송구
      const throw_time = calcThrowTime(bs.receiver, bs.receiver_pos, target, lineup)
      return bs.t_remaining + 0.5 + throw_time  // 0.5s 수신 전환 시간
    }
    case 'held': {
      return calcThrowTime(bs.fielder, bs.fielder_pos, target, lineup)
    }
  }
}

// ============================================================
// estimateOutProb — 특정 주자를 아웃시킬 확률 (0~1)
//
// resolveThrow와 동일한 sigmoid 로직 사용
// ============================================================

export function estimateOutProb(
  fielder:       Player,
  runner:        Player,
  runner_dist:   number,
  ball_state:    BallState,
  target:        BaseKey,
  defenceLineup: Player[],
): number {
  const t_ball         = calcBallArrivalTime(ball_state, target, defenceLineup)
  const runner_speed   = 5.0 + (runner.stats.running / 100) * 3.0
  const t_runner       = runner_dist / runner_speed
  const margin         = t_ball - t_runner   // 양수 = 주자 유리 = 낮은 out_prob
  const p_safe         = sigmoid(margin, 0.5)
  return 1 - p_safe
}

// ============================================================
// decideChallengeAdvance — 주자가 특정 목표 베이스로 진루를 시도할지 결정
//
// 주자의 판단력(judgment)에 따른 인식 오차를 적용한 마진 비교
// ============================================================

export function decideChallengeAdvance(
  runner:        Player,
  runner_dist:   number,
  ball_state:    BallState,
  target:        BaseKey,
  defenceLineup: Player[],
): boolean {
  const judgment     = runner.stats.judgment ?? runner.stats.defence
  const runner_speed = 5.0 + (runner.stats.running / 100) * 3.0

  const t_ball           = calcBallArrivalTime(ball_state, target, defenceLineup)
  const t_runner         = runner_dist / runner_speed
  const actual_margin    = t_ball - t_runner      // 양수 = 공이 늦게 도착 = 주자 유리
  const sigma            = 0.5 * (1 - judgment / 100)
  // 주자는 클로즈 플레이에서 자신이 유리하다는 것을 경험적으로 알고 있음
  // resolveThrow의 runner_bias(+0.5s)를 부분적으로 반영한 용기 보정
  const courage_bias     = 0.5
  const perceived_margin = actual_margin + courage_bias + gaussianNoise(sigma)

  return perceived_margin > 0
}

// ============================================================
// VIABILITY_THRESHOLD — 아웃 확률 하한: 이 미만이면 해당 타깃 포기
// ============================================================

export const VIABILITY_THRESHOLD = 0.05

// ============================================================
// decideThrowTarget — 수비수가 어느 베이스로 송구할지 결정
//
// 1. viability filter (p_out < 0.05는 제외)
// 2. isCritical override (득점 위기 시 홈 우선)
// 3. judgment 기반 sigmoid 선택 (최적 vs 차선)
// ============================================================

export function decideThrowTarget(
  fielder:            Player,
  runners_attempting: Array<{ runner: Player; target: BaseKey; runner_dist: number }>,
  ball_state:         BallState,
  isCritical:         boolean,
  defenceLineup:      Player[],
): BaseKey | null {
  const judgment = fielder.stats.judgment ?? fielder.stats.defence

  // Step 1: viability filter
  const viable = runners_attempting.filter(a =>
    estimateOutProb(fielder, a.runner, a.runner_dist, ball_state, a.target, defenceLineup)
    >= VIABILITY_THRESHOLD
  )
  if (viable.length === 0) return null

  // Step 2: isCritical override — 홈 진루 시도 주자가 있으면 반드시 홈 송구
  if (isCritical) {
    const homeAttempt = viable.find(a => a.target === 'home')
    if (homeAttempt) return 'home'
  }

  // Step 3: judgment 기반 선택
  const withProb = viable.map(a => ({
    ...a,
    p_out: estimateOutProb(fielder, a.runner, a.runner_dist, ball_state, a.target, defenceLineup),
  }))
  withProb.sort((a, b) => b.p_out - a.p_out)

  const optimal    = withProb[0]
  const suboptimal = withProb[withProb.length - 1]

  // judgment 높을수록 최적 선택 확률↑
  const p_correct = 1 / (1 + Math.exp(-((judgment - 50) * 0.05)))
  const chosen    = Math.random() < p_correct ? optimal : suboptimal

  return chosen.target
}

// ============================================================
// getReceiverAtBase — 베이스별 수비수 매핑
//
// home → C, 1B → 1B, 2B → SS or 2B, 3B → 3B
// 해당 포지션 없으면 throw_stat 70 dummy 반환
// ============================================================

export function getReceiverAtBase(
  target:  BaseKey,
  lineup:  Player[],
): { player: Player; pos: Vec2 } {
  const posMap: Record<BaseKey, Array<import('../types/player').Position>> = {
    home: ['C'],
    '1B': ['1B'],
    '2B': ['2B', 'SS'],
    '3B': ['3B'],
  }
  const candidates = posMap[target]
  const found = lineup.find(p =>
    candidates.includes(p.position_1) ||
    (p.position_2 !== null && candidates.includes(p.position_2))
  )

  const dummy: Player = found ?? {
    id: `receiver_dummy_${target}`, team_id: '', name: 'Receiver', number: 0,
    age: 25, bats: 'R', throws: 'R',
    position_1: candidates[0], position_2: null, position_3: null,
    stats: {
      ball_power: 0, ball_control: 0, ball_break: 0, ball_speed: 0,
      contact: 50, power: 50, defence: 50, throw: 70, running: 50, stamina: 100,
    },
    pitch_types: [], zone_bottom: 0.5, zone_top: 1.1, portrait_url: null,
  }

  return { player: dummy, pos: BASE_POS[target] }
}

// ============================================================
// resolveSecondaryThrow — 2차 송구 판정
//
// 1차 송구 수신자가 다른 베이스로 추가 송구하는 경우.
// challenger_remaining = 도전 시작 거리 - runner_speed × t_first_throw
// ============================================================

export function resolveSecondaryThrow(
  receiver:              Player,
  receiver_pos:          Vec2,
  secondary_target:      BaseKey,
  t_first_throw:         number,   // 1차 송구 총 소요 시간 (t_fielding + 1차 throw 비행 시간)
  challenger:            Player,
  original_runner_dist:  number,   // 도전 시작 시점의 목표 베이스까지 거리
): 'safe' | 'out' | 'wild_throw' {
  const runner_speed          = 5.0 + (challenger.stats.running / 100) * 3.0
  const challenger_remaining  = Math.max(0, original_runner_dist - runner_speed * t_first_throw)

  const t_secondary_reaction  = 0.5   // 공 이미 수중, 회전 + 투구
  const throw_dist            = euclidDist(receiver_pos, BASE_POS[secondary_target])

  return resolveThrow(receiver, throw_dist, t_secondary_reaction, challenger, challenger_remaining)
}
