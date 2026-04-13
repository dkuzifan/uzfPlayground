// ============================================================
// 번트 엔진 (Phase 1)
// PRD: docs/baseball/prd/260413-bunt.md
//
// 결정 AI (희생번트 / 기습번트) + 실행 파이프라인 + 수비 대응을
// 한 파일에 통합. 복잡해지면 분리 예정.
// ============================================================

import type { Player } from '../types/player'
import type { PitchResult } from '../engine/types'
import type { BattingState, BattingResult } from './types'
import type { HitResultDetail } from '../defence/types'
import { FIELDER_DEFAULT_POS } from '../defence/fielder-positions'
import { applyPitchToCount } from './count'

// ============================================================
// 튜닝 계수
// ============================================================

export const BUNT_CONFIG = {
  // 결정 AI — 희생번트
  // MLB 실제 빈도: ~0.3 SH/game. 조건 만족 PA 기준 base ~8~10%
  sacrifice_base: 0.08,
  sacrifice_runners_1_2_bonus: 0.06,
  sacrifice_close_score_bonus: 0.04,
  sacrifice_late_inning_bonus: 0.04,

  // 희생번트 스탯 모디파이어 weight
  sac_contact_weight: 40,   // (65-contact)/40
  sac_power_weight:   50,   // (60-power)/50
  sac_eye_weight:     80,   // (60-eye)/80
  sac_running_weight: 100,  // (50-running)/100

  sac_multiplier_min: 0.10,
  sac_multiplier_max: 2.00,

  // 결정 AI — 기습번트
  // MLB 실제 빈도: ~0.05~0.1 bunt hit/game
  hit_base: 0.0015,
  hit_running_scale: 3,   // (1 + k*normalized)
  hit_contact_scale: 2,

  // 컨택 성공률 (실패 → 헛스윙)
  contact_base: 0.75,

  // 파울 확률
  foul_base: 0.30,

  // 팝업 확률
  popup_base: 0.08,

  // 번트 수비 처리 — 에러율 배수
  bunt_error_multiplier: 1.5,
  bunt_error_coeff:      0.04,  // 기본 에러율 ~4%
} as const

// ============================================================
// 결정 AI — decideBunt()
// ============================================================

export interface BuntDecision {
  attempt: boolean
  intent?: 'sacrifice' | 'hit'
}

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x))
}

export function decideBunt(
  batter:  Player,
  count:   BattingState['count'],
  runners: BattingState['runners'],
  situation: { outs: number; inning: number; scoreDiff?: number }
): BuntDecision {
  // 공통 게이트: 2스트라이크 진입 전 (파울=삼진 리스크)
  if (count.strikes >= 2) return { attempt: false }
  if (situation.outs >= 2) return { attempt: false }

  const scoreDiff = situation.scoreDiff ?? 0  // 타자 팀 기준 (+ = 리드)

  // ── (A) 희생번트 판정 ────────────────────────────────────
  // 주자 있음 (1루 또는 2루에 주자)
  if (runners.first || runners.second) {
    // 점수차 게이트: 너무 앞서거나 크게 뒤질 때는 번트 의미 없음
    if (scoreDiff <= 2 && scoreDiff >= -4) {
      // 이닝 게이트: 후반(7회+) 또는 1회 초 (선취점 기대)
      if (situation.inning >= 7 || (situation.inning === 1)) {
        // 상황 base 확률
        let base = BUNT_CONFIG.sacrifice_base
        if (runners.first && runners.second) base += BUNT_CONFIG.sacrifice_runners_1_2_bonus
        if (scoreDiff === 0 || scoreDiff === -1) base += BUNT_CONFIG.sacrifice_close_score_bonus
        if (situation.inning >= 9 && Math.abs(scoreDiff) <= 1) base += BUNT_CONFIG.sacrifice_late_inning_bonus

        // 스탯 모디파이어 (포지션 체크 없이 스탯만으로 투웨이 대응)
        const c  = batter.stats.contact
        const p  = batter.stats.power
        const e  = batter.stats.eye ?? 50
        const r  = batter.stats.running

        const contactFactor = clamp((65 - c) / BUNT_CONFIG.sac_contact_weight, -0.5, +0.5)
        const powerFactor   = clamp((60 - p) / BUNT_CONFIG.sac_power_weight,   -0.4, +0.4)
        const eyeFactor     = clamp((60 - e) / BUNT_CONFIG.sac_eye_weight,     -0.2, +0.2)
        const runningFactor = clamp((50 - r) / BUNT_CONFIG.sac_running_weight, -0.15, +0.1)

        const multiplier = clamp(
          1 + contactFactor + powerFactor + eyeFactor + runningFactor,
          BUNT_CONFIG.sac_multiplier_min,
          BUNT_CONFIG.sac_multiplier_max,
        )
        const finalProb = base * multiplier

        if (Math.random() < finalProb) {
          return { attempt: true, intent: 'sacrifice' }
        }
      }
    }
    return { attempt: false }
  }

  // ── (B) 기습번트 판정 (주자 없음) ────────────────────────
  const c = batter.stats.contact
  const e = batter.stats.eye ?? 50
  const r = batter.stats.running

  // 게이트: 최소 스펙 (느리거나 컨택 너무 낮으면 시도 의미 없음)
  if (r < 50 || c < 45) return { attempt: false }

  const runningFactor = clamp((r - 60) / 30, 0, 1.0)
  const contactFactor = clamp((c - 50) / 40, 0, 0.6)
  const eyeFactor     = clamp((60 - e) / 60, -0.2, 0.2)

  let prob = BUNT_CONFIG.hit_base
    * (1 + BUNT_CONFIG.hit_running_scale * runningFactor)
    * (1 + BUNT_CONFIG.hit_contact_scale * contactFactor)
    * (1 + eyeFactor)

  if (batter.bats === 'L') prob *= 1.3
  if (situation.inning >= 9 && Math.abs(scoreDiff) <= 1) prob *= 1.5

  if (Math.random() < prob) {
    return { attempt: true, intent: 'hit' }
  }

  return { attempt: false }
}

// ============================================================
// 방향 선택 — 번트 종류와 주자/타자에 따라
// ============================================================

type BuntDirection = 'first_base_line' | 'pitcher_front' | 'third_base_line'

function weightedPick(weights: Record<BuntDirection, number>): BuntDirection {
  const total = weights.first_base_line + weights.pitcher_front + weights.third_base_line
  let roll = Math.random() * total
  if ((roll -= weights.first_base_line) < 0) return 'first_base_line'
  if ((roll -= weights.pitcher_front)   < 0) return 'pitcher_front'
  return 'third_base_line'
}

function pickSacrificeDirection(
  runners: BattingState['runners'],
  batter: Player,
): BuntDirection {
  // 기본 분포 — 주자 상황별
  let weights: Record<BuntDirection, number>
  if (runners.first && !runners.second) {
    // 1루 주자만 → 1루선 선호 (1B 끌어내기)
    weights = { first_base_line: 60, pitcher_front: 25, third_base_line: 15 }
  } else if (runners.second && !runners.first) {
    // 2루 주자만 → 3루선 선호 (3B 끌어내기)
    weights = { first_base_line: 15, pitcher_front: 25, third_base_line: 60 }
  } else if (runners.first && runners.second) {
    // 1·2루 → 3루선 강하게 선호
    weights = { first_base_line: 20, pitcher_front: 25, third_base_line: 55 }
  } else {
    // 만루 또는 3루 주자만 (스퀴즈 스킵)
    weights = { first_base_line: 20, pitcher_front: 30, third_base_line: 50 }
  }

  // 타자 컨택 보정
  const c = batter.stats.contact
  if (c >= 60) {
    // 정확한 타자 — 의도 방향 +10%p
    const max = Math.max(weights.first_base_line, weights.pitcher_front, weights.third_base_line)
    if (weights.first_base_line === max) weights.first_base_line += 10
    else if (weights.third_base_line === max) weights.third_base_line += 10
    else weights.pitcher_front += 10
  } else if (c < 40) {
    // 의도 실패 — 약한 번트가 투수 앞으로 빗나감
    weights = { first_base_line: 30, pitcher_front: 50, third_base_line: 20 }
  }

  return weightedPick(weights)
}

function pickHitDirection(batter: Player): BuntDirection {
  const r = batter.stats.running
  const isLeft = batter.bats === 'L'

  let weights: Record<BuntDirection, number>
  if (isLeft && r >= 75) {
    // 드래그 번트 — 1루선
    weights = { first_base_line: 75, pitcher_front: 15, third_base_line: 10 }
  } else if (!isLeft && r >= 75) {
    // 우타 빠른 주자 — 3루선 (긴 송구 거리)
    weights = { first_base_line: 15, pitcher_front: 20, third_base_line: 65 }
  } else {
    // 느린 편 / 일반 — 세이프티 기본 (3루선)
    weights = { first_base_line: 15, pitcher_front: 30, third_base_line: 55 }
  }

  const c = batter.stats.contact
  if (c >= 70) {
    const max = Math.max(weights.first_base_line, weights.pitcher_front, weights.third_base_line)
    if (weights.first_base_line === max) weights.first_base_line += 15
    else if (weights.third_base_line === max) weights.third_base_line += 15
    else weights.pitcher_front += 15
  }

  return weightedPick(weights)
}

// ============================================================
// 타구 생성 — 방향 + 거리 + 좌표
// ============================================================

// field 좌표계: +x = 1루 방향, +y = CF 방향
function directionToTheta(dir: BuntDirection): number {
  // theta_h 정의: 0 = CF(직진), + = 1루 쪽, - = 3루 쪽
  // (batting/hit-result.ts의 theta_h와 일치하게 유지)
  if (dir === 'first_base_line') return 35 + (Math.random() - 0.5) * 10
  if (dir === 'third_base_line') return -35 + (Math.random() - 0.5) * 10
  return (Math.random() - 0.5) * 10   // P 정면
}

function buntDistance(batter: Player): number {
  const c = batter.stats.contact
  if (c >= 60) {
    // 경계(15~20m) 편향 — 베이스라인 옆으로 정확
    return 14 + Math.random() * 6
  } else if (c < 40) {
    // 중심(8~12m) 편향 — 약한 P앞 번트
    return 7 + Math.random() * 5
  }
  return 5 + Math.random() * 15   // 일반 5~20m
}

function toFieldPos(range: number, thetaDeg: number): { x: number; y: number } {
  const rad = thetaDeg * Math.PI / 180
  return {
    x: range * Math.sin(rad),
    y: range * Math.cos(rad),
  }
}

// ============================================================
// 수비수 선택 — 번트 전용
// ============================================================

function getFielderPos(p: Player): { x: number; y: number } {
  if (p.defence_pos) return p.defence_pos
  const def = FIELDER_DEFAULT_POS[p.position_1]
  return def ?? { x: 0, y: 20 }
}

function dist2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x, dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function pickBuntFielder(
  landing: { x: number; y: number },
  dir: BuntDirection,
  defence: Player[],
): { fielder: Player; dist: number } {
  // 후보: 방향에 따라 좁힘
  const byPos = (pos: string) => defence.find(p => p.position_1 === pos)
  const candidates: Player[] = []

  if (dir === 'first_base_line') {
    const b1 = byPos('1B'); const p = byPos('P'); const c = byPos('C')
    if (b1) candidates.push(b1)
    if (p)  candidates.push(p)
    if (c)  candidates.push(c)
  } else if (dir === 'third_base_line') {
    const b3 = byPos('3B'); const p = byPos('P'); const c = byPos('C')
    if (b3) candidates.push(b3)
    if (p)  candidates.push(p)
    if (c)  candidates.push(c)
  } else {
    // P 정면 — P + C (Q2 결정: 포수 포함)
    const p = byPos('P'); const c = byPos('C')
    if (p) candidates.push(p)
    if (c) candidates.push(c)
  }

  if (candidates.length === 0) {
    // 라인업 문제 — 아무 야수 반환
    return { fielder: defence[0], dist: 99 }
  }

  // 가장 가까운 수비수 선택
  let best = candidates[0]
  let bestDist = dist2(landing, getFielderPos(best))
  for (let i = 1; i < candidates.length; i++) {
    const d = dist2(landing, getFielderPos(candidates[i]))
    if (d < bestDist) {
      best = candidates[i]
      bestDist = d
    }
  }
  return { fielder: best, dist: bestDist }
}

// ============================================================
// 수비 대응 — resolveBuntDefense
// ============================================================

const BASE_DIST = 27.43   // 1루 ~ 홈 거리 (m)
const THROW_SPEED = 32    // 평균 내야 송구 속도 (m/s, 근거리)

function resolveBuntDefense(
  landing: { x: number; y: number },
  range:   number,
  thetaDeg: number,
  dir:     BuntDirection,
  batter:  Player,
  runners: BattingState['runners'],
  outs:    number,
  defence: Player[],
): HitResultDetail {
  // Step 1: 처리 야수 결정
  const { fielder, dist: distToBall } = pickBuntFielder(landing, dir, defence)

  // Step 2: 포구 시간 계산
  // 번트 수비는 전력 질주 + 예측 출발 → 일반 수비보다 빠름
  const charge_speed = 6.5 + (fielder.stats.running / 100) * 1.5  // 6.5~8.0 m/s
  const t_ball_travel = Math.max(0.3, range / 16)  // 번트 타구 느리지만 거리 짧음
  const t_fielding = t_ball_travel + distToBall / charge_speed + 0.35

  // Step 3: 에러 판정
  const error_chance = BUNT_CONFIG.bunt_error_coeff
    * BUNT_CONFIG.bunt_error_multiplier
    * (1 - fielder.stats.defence / 200)
  if (Math.random() < error_chance) {
    return {
      result: 'reach_on_error',
      fielder,
      fielder_pos: getFielderPos(fielder),
      t_fielding: t_fielding + 1.0,
      t_ball_travel,
      is_infield: true,
      range,
      ball_type: 'grounder',
      theta_h: thetaDeg,
      is_error: true,
    }
  }

  // Step 4: 선행 주자 송구 판단
  const batter_run_speed = 5.0 + (batter.stats.running / 100) * 3.0
  const t_batter_to_1B = BASE_DIST / batter_run_speed

  // 1루 주자 + 포스 상태 → 2루 송구 시도
  if (runners.first) {
    // 포스 주자의 1루→2루 시간
    // 리드(0.8s 이미 소모) + 26.5m / running 기반 속도
    const lead_advance = 0.5  // 번트 시작 후 주자 반응 빠름
    const runner_speed = 5.5 + (batter.stats.running / 100) * 2.5  // 주자 평균
    const t_runner_to_2B = lead_advance + 26.5 / runner_speed

    // 야수 위치 → 2루 거리
    const second_base = { x: 0, y: 38.8 }  // 2루 대략 좌표
    const throw_dist_2B = dist2(getFielderPos(fielder), second_base)
    const t_throw_2B = throw_dist_2B / THROW_SPEED + 0.2
    const t_to_2B = t_fielding + t_throw_2B

    // 안전 마진 0.7s — 확실히 잡을 수 있을 때만 선행 주자 노림
    // (실패 시 all safe 리스크 + 번트 주자 평균 이상 발 → 수비팀은 보수적)
    if (t_to_2B + 0.7 < t_runner_to_2B) {
      // 2루 포스아웃 성공 → 피벗 송구 (병살 시도)
      // 번트 병살은 극히 드묾 — 피벗 반응/셋업 시간 보수적으로
      const first_base = { x: 19.4, y: 19.4 }
      const pivot_throw_dist = dist2(second_base, first_base)
      const t_pivot = t_to_2B + 0.6 + pivot_throw_dist / THROW_SPEED + 0.3

      if (t_pivot < t_batter_to_1B) {
        // 번트 병살
        return {
          result: 'double_play',
          fielder,
          fielder_pos: getFielderPos(fielder),
          t_fielding,
          t_ball_travel,
          is_infield: true,
          range,
          ball_type: 'grounder',
          theta_h: thetaDeg,
        }
      }
      // 2루 포스아웃 + 타자 1루 세이프 = 야수선택
      return {
        result: 'fielders_choice',
        fielder,
        fielder_pos: getFielderPos(fielder),
        t_fielding,
        t_ball_travel,
        is_infield: true,
        range,
        ball_type: 'grounder',
        theta_h: thetaDeg,
      }
    }
    // 2루 송구 불가 → 1루 송구로 폴백 (all safe or 타자 아웃)
  }

  // Step 5: 1루 송구 결과
  const first_base = { x: 19.4, y: 19.4 }
  const throw_dist_1B = dist2(getFielderPos(fielder), first_base)
  const t_to_1B = t_fielding + throw_dist_1B / THROW_SPEED + 0.2

  if (t_to_1B < t_batter_to_1B) {
    // 타자 1루 아웃 (희생번트 성공 또는 기습번트 실패)
    return {
      result: 'out',
      fielder,
      fielder_pos: getFielderPos(fielder),
      t_fielding,
      t_ball_travel,
      is_infield: true,
      range,
      ball_type: 'grounder',
      theta_h: thetaDeg,
      catch_setup_time: 0.3,
    }
  }

  // 타자 1루 세이프 = 번트 안타
  return {
    result: 'single',
    fielder,
    fielder_pos: getFielderPos(fielder),
    t_fielding,
    t_ball_travel,
    is_infield: true,
    range,
    ball_type: 'grounder',
    theta_h: thetaDeg,
  }
}

// ============================================================
// 메인 실행 — resolveBunt()
// ============================================================

export function resolveBunt(
  state:   BattingState,
  pitch:   PitchResult,
  defence: Player[] | undefined,
  intent:  'sacrifice' | 'hit',
): BattingResult {
  const { batter, count } = state
  const defenceLineup = defence ?? []

  // HBP — 번트 의사와 무관하게 사구는 사구
  if (pitch.is_hbp) {
    return {
      swing: false,
      contact: null,
      is_foul: null,
      exit_velocity: null,
      launch_angle: null,
      ...applyPitchToCount(count, 'strike', true),
    }
  }

  // ── 2-1. 컨택 판정 ──────────────────────────────────────
  // 스트라이크 존 밖이면 타자가 배트 거둘 수 있음 (볼 처리)
  if (!pitch.is_strike) {
    return {
      swing: false,
      contact: null,
      is_foul: null,
      exit_velocity: null,
      launch_angle: null,
      is_bunt: true,
      bunt_intent: intent,
      ...applyPitchToCount(count, 'ball', false),
    }
  }

  // 컨택 성공률: base + contact 스탯 - 구속 - 변화
  const pitchData = state.pitcher.pitch_types.find(pt => pt.type === pitch.pitch_type)
  const contact_prob =
    BUNT_CONFIG.contact_base
    + (batter.stats.contact - 50) / 200
    - (state.pitcher.stats.ball_speed - 80) / 100
    - ((pitchData?.ball_break ?? 30) / 200)

  if (Math.random() > clamp(contact_prob, 0.35, 0.95)) {
    // 헛스윙 → 스트라이크
    return {
      swing: true,
      contact: false,
      is_foul: null,
      exit_velocity: null,
      launch_angle: null,
      is_bunt: true,
      bunt_intent: intent,
      ...applyPitchToCount(count, 'strike', false),
    }
  }

  // ── 2-2. 파울 판정 ──────────────────────────────────────
  // contact 낮을수록 파울 ↑
  const foul_prob = BUNT_CONFIG.foul_base
    + clamp((55 - batter.stats.contact) / 200, -0.1, 0.15)

  if (Math.random() < foul_prob) {
    // 번트는 2스트라이크 진입 전에만 시도하므로 파울이 즉시 스트라이크에 들어감
    // (낫아웃 미구현 단계에선 이게 정상 룰)
    return {
      swing: true,
      contact: true,
      is_foul: true,
      exit_velocity: null,
      launch_angle: null,
      is_bunt: true,
      bunt_intent: intent,
      ...applyPitchToCount(count, 'foul', false),
    }
  }

  // ── 2-3. 팝업 판정 ──────────────────────────────────────
  const popup_prob = BUNT_CONFIG.popup_base
    + (state.pitcher.stats.ball_speed - 80) / 300
    - (batter.stats.contact - 50) / 400

  if (Math.random() < clamp(popup_prob, 0.02, 0.25)) {
    // 팝업 번트 — 투수 앞 5~15m, popup 타구
    const popup_range = 5 + Math.random() * 10
    const theta = (Math.random() - 0.5) * 30
    const landing = toFieldPos(popup_range, theta)
    const { fielder } = pickBuntFielder(landing, 'pitcher_front', defenceLineup)

    // IFR 조건 체크 (이미 구현된 로직과 동일)
    const ifrRunners = state.runners.first && state.runners.second
    const ifrOuts    = state.outs < 2
    const is_infield_fly = ifrRunners && ifrOuts

    // 팝업은 거의 확실히 포구 (popup catch_prob = 1.0)
    const hitDetail: HitResultDetail = {
      result: 'out',
      fielder,
      fielder_pos: getFielderPos(fielder),
      t_fielding: 2.0,
      t_ball_travel: 1.5,
      is_infield: true,
      range: popup_range,
      ball_type: 'popup',
      theta_h: theta,
      catch_setup_time: 0.3,
    }

    return {
      swing: true,
      contact: true,
      is_foul: false,
      exit_velocity: 20,
      launch_angle: 55,
      at_bat_result: 'out',
      hit_physics: hitDetail,
      next_count: count,
      at_bat_over: true,
      is_bunt: true,
      bunt_intent: intent,
      is_infield_fly: is_infield_fly || undefined,
      // 희생번트 의도였지만 팝업 처리 — SH 집계 대상은 아님 (타자 아웃 + 주자 진루 효과 없음)
    }
  }

  // ── 2-4. 유효 번트 타구 생성 ────────────────────────────
  const dir = intent === 'sacrifice'
    ? pickSacrificeDirection(state.runners, batter)
    : pickHitDirection(batter)

  const range = buntDistance(batter)
  const thetaDeg = directionToTheta(dir)
  const landing = toFieldPos(range, thetaDeg)

  // ── 2-5. 수비 대응 ──────────────────────────────────────
  const hitDetail = resolveBuntDefense(
    landing, range, thetaDeg, dir, batter, state.runners, state.outs, defenceLineup,
  )

  // 희생번트 성공 플래그: 의도가 sacrifice + 주자 진루 + 타자 아웃
  const isSacSuccess = intent === 'sacrifice' && hitDetail.result === 'out'

  return {
    swing: true,
    contact: true,
    is_foul: false,
    exit_velocity: 25,
    launch_angle: 0,
    at_bat_result: hitDetail.result,
    hit_physics: hitDetail,
    next_count: count,
    at_bat_over: true,
    is_bunt: true,
    bunt_intent: intent,
    is_sacrifice_bunt: isSacSuccess || undefined,
  }
}
