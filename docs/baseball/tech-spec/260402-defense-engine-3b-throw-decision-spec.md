---
title: "Tech Spec — 수비 엔진 #3-b 송구 방향 판단 & 도전 주자 & 추가 송구"
date: 2026-04-02
prd: docs/baseball/prd/260401-defense-engine-3b-throw-decision.md
status: draft
---

## 영향 파일

| 파일 | 변경 유형 |
|------|---------|
| `src/lib/baseball/types/player.ts` | **수정** — `PlayerStats.judgment?` 추가 |
| `src/lib/baseball/game/types.ts` | **수정** — `AtBatContext` 스코어 필드, `GameEventType` 확장 |
| `src/lib/baseball/game/runner-advance.ts` | **수정** — `RunnerMove.return_penalty?`, `resolveRunnerAdvances` (대체), `advanceRunners` 시그니처 |
| `src/lib/baseball/defence/types.ts` | **수정** — `HitResultDetail.catch_setup_time?` 예약 필드 |
| `src/lib/baseball/defence/throw-judge.ts` | **수정** — `BallState` 타입 추가 |
| `src/lib/baseball/defence/runner-decision.ts` | **신규** — 4개 함수 |
| `src/lib/baseball/game/half-inning.ts` | **수정** — `AtBatContext`에 스코어 주입 |
| `src/lib/baseball/game/at-bat.ts` | **수정** — `scoreContext` 전달 |

---

## 타입 변경

### `PlayerStats` (`types/player.ts`)

```typescript
export interface PlayerStats {
  // 기존 필드 유지 ...
  stamina: number
  judgment?: number   // 추가. 미설정 시 defence 스탯을 proxy로 사용
}
```

---

### `AtBatContext` (`game/types.ts`)

```typescript
export interface AtBatContext {
  // 기존 필드 유지 ...
  catcher:        Player
  battingScore:   number   // 추가: 현재 공격 팀 점수
  defenseScore:   number   // 추가: 현재 수비 팀 점수
}
```

`isCritical` 계산: `target === 'home' && (battingScore + 1 >= defenseScore)`

---

### `GameEventType` (`game/types.ts`)

```typescript
export type GameEventType =
  | /* 기존 */ 'pitch' | 'at_bat_result' | 'runner_advance' | ...
  | 'secondary_throw'   // 추가: { receiver: Player; receiver_pos: Vec2; target: BaseKey; challenger: Player; out: boolean }
```

---

### `RunnerMove` (`game/runner-advance.ts`)

```typescript
export interface RunnerMove {
  runner: Player
  from:   1 | 2 | 3 | 'batter'
  to:     1 | 2 | 3 | 'home'
  return_penalty?: number   // 예약: 귀루 중 주자. #4/#5에서 활용
}
```

---

### `HitResultDetail` (`defence/types.ts`)

```typescript
export interface HitResultDetail {
  // 기존 필드 유지 ...
  is_infield:       boolean
  catch_setup_time?: number   // 예약: 포구 난이도별 준비 시간. #5에서 계산 로직 추가
}
```

---

### `BallState` (`defence/throw-judge.ts`)

```typescript
export type Vec2 = { x: number; y: number }

// t_remaining: 이 결정 시점에서 해당 phase가 완료될 때까지 남은 시간 (s)
// 호출자(resolveRunnerAdvances)가 runner 이동 시간을 반영해 t_remaining을 조정해 전달한다
export type BallState =
  | { phase: 'in_air';          t_remaining: number; catch_probability: number;
      fielder_pos: Vec2; fielder: Player }    // ※ 타입 예약 — 실제 구현은 #5
  | { phase: 'fielding';        t_remaining: number;
      fielder_pos: Vec2; fielder: Player }
  | { phase: 'throw_in_flight'; t_remaining: number;
      target: BaseKey; receiver_pos: Vec2; receiver: Player }
  | { phase: 'held';            fielder: Player; fielder_pos: Vec2 }
```

---

## 신규 파일: `defence/runner-decision.ts`

### `estimateOutProb` (내부 헬퍼)

수비수가 특정 주자를 아웃시킬 수 있는 확률 (0~1).

```typescript
function estimateOutProb(
  fielder:       Player,
  runner:        Player,
  runner_dist:   number,
  ball_state:    BallState,
  target:        BaseKey,
  defenceLineup: Player[],
): number {
  const t_ball = calcBallArrivalTime(ball_state, target, fielder, defenceLineup)
  const runner_speed = 5.0 + (runner.stats.running / 100) * 3.0
  const t_runner = runner_dist / runner_speed
  const margin = t_ball - t_runner     // 양수 = 주자 유리 = 낮은 out_prob
  // resolveThrow와 동일한 sigmoid 사용, out_prob = 1 - p_safe
  return 1 - sigmoid(margin, 0.5)
}
```

**`calcBallArrivalTime(ball_state, target, fielder, lineup)`** — BallState별 도달 시간 산출:

| phase | t_ball_arrive_at_target |
|-------|------------------------|
| `fielding` | `t_remaining + t_throw(fielder_pos, target, fielder, lineup)` |
| `throw_in_flight` (같은 target) | `t_remaining` |
| `throw_in_flight` (다른 target) | `t_remaining + t_relay(receiver_pos, target, receiver, lineup)` |
| `held` | `t_throw(fielder_pos, target, fielder, lineup)` |

`t_throw`는 `shouldUseRelay`로 relay 여부 판단 후 직접/중계 시간 중 적절한 값 반환.

---

### `decideChallengeAdvance`

```typescript
export function decideChallengeAdvance(
  runner:        Player,
  runner_dist:   number,
  ball_state:    BallState,
  target:        BaseKey,
  defenceLineup: Player[],
): boolean {
  const judgment     = runner.stats.judgment ?? runner.stats.defence
  const runner_speed = 5.0 + (runner.stats.running / 100) * 3.0
  const fielder      = getFielderFromBallState(ball_state)

  const t_ball   = calcBallArrivalTime(ball_state, target, fielder, defenceLineup)
  const t_runner = runner_dist / runner_speed

  const actual_margin   = t_ball - t_runner
  const sigma           = 0.5 * (1 - judgment / 100)
  const perceived_margin = actual_margin + gaussianNoise(sigma)

  return perceived_margin > 0
}
```

`gaussianNoise(sigma)`: Box-Muller 또는 간단한 근사로 `N(0, sigma)` 샘플링.

---

### `decideThrowTarget`

```typescript
export const VIABILITY_THRESHOLD = 0.05  // 5% 미만 아웃 확률 → 타깃 포기

export function decideThrowTarget(
  fielder:           Player,
  runners_attempting: Array<{ runner: Player; target: BaseKey; runner_dist: number }>,
  ball_state:        BallState,
  isCritical:        boolean,
  defenceLineup:     Player[],
): BaseKey | null {
  const judgment = fielder.stats.judgment ?? fielder.stats.defence

  // Step 1: viability filter
  const viable = runners_attempting.filter(a =>
    estimateOutProb(fielder, a.runner, a.runner_dist, ball_state, a.target, defenceLineup)
    >= VIABILITY_THRESHOLD
  )
  if (viable.length === 0) return null

  // Step 2: isCritical override
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

  const p_correct = 1 / (1 + Math.exp(-((judgment - 50) * 0.05)))
  const chosen = Math.random() < p_correct ? optimal : suboptimal

  return chosen.target
}
```

---

### `resolveSecondaryThrow`

```typescript
export function resolveSecondaryThrow(
  receiver:            Player,
  receiver_pos:        Vec2,
  secondary_target:    BaseKey,
  t_first_throw:       number,   // 1차 송구 총 소요 시간 (t_fielding + 1차 throw 비행 시간)
  challenger:          Player,
  original_runner_dist: number,  // 도전 시작 시점의 목표 베이스까지 거리
): 'safe' | 'out' {
  const runner_speed = 5.0 + (challenger.stats.running / 100) * 3.0
  const challenger_remaining = Math.max(0, original_runner_dist - runner_speed * t_first_throw)

  const t_secondary_reaction = 0.5   // 공 이미 수중, 회전 + 투구
  const throw_dist = euclidDist(receiver_pos, BASE_POS[secondary_target])

  return resolveThrow(receiver, throw_dist, t_secondary_reaction, challenger, challenger_remaining)
}
```

---

## 핵심 수정: `runner-advance.ts`

### `resolveRunnerAdvances` (기존 `resolveLeadingRunner` 대체)

기존 `resolveLeadingRunner`가 "선행 주자 1명에게 항상 송구"하던 것을 **모든 주자가 스스로 진루 여부를 판단**하는 범용 모델로 교체.

```typescript
function resolveRunnerAdvances(
  runners:        Runners,
  hp:             HitResultDetail,
  stealState?:    StealState,
  defenceLineup?: Player[],
  scoreContext?:  { battingScore: number; defenseScore: number },
): { nextRunners: Runners; runsScored: number; outs_added: number; moves: RunnerMove[] }
```

**구현 흐름:**

```
1. Initial BallState 구성
   ball_state = { phase: 'fielding', t_remaining: hp.t_fielding, fielder_pos, fielder }

2. 각 주자의 최종 도전 목표 결정 (홈에 가까운 순서: 3B → 2B → 1B)
   findRunnerTarget(runner, fromBase, hp, stealState, lineup)
   → 베이스를 하나씩 늘려가며 decideChallengeAdvance
   → 각 단계에서 BallState.t_remaining을 runner 이동 시간만큼 차감 조정
   → YES인 마지막 베이스가 최종 target

3. isCritical 계산 (scoreContext가 있을 때)
   isCritical = attempts.some(a => a.target === 'home') &&
                (battingScore + 1 >= defenseScore)

4. decideThrowTarget(fielder, attempts, ball_state, isCritical, lineup)
   → chosenTarget (null이면 모두 진루 허용)

5. 주타깃 주자: throwVerdict (기존 resolveThrow/resolveRelayThrow 패턴 유지)
   t_first_throw = hp.t_fielding + dist(fielder_pos, chosenTarget) / throw_speed

6. 비타깃 주자 처리:
   a) 원래 목표 베이스로 무혈 진루 (free advance)
   b) 다음 베이스 재결정:
      t_runner_to_target = runner_dist / runner_speed
      if t_runner_to_target < t_first_throw:
        re_ball_state = throw_in_flight { t_remaining: t_first_throw - t_runner_to_target, ... }
      else:
        re_ball_state = held { receiver, receiver_pos }
      if decideChallengeAdvance(runner, next_runner_dist, re_ball_state, next_target, lineup):
        result = resolveSecondaryThrow(receiver, receiver_pos, next_target,
                                       t_first_throw, runner, next_runner_dist)
        → events.push secondary_throw event
```

---

### `findRunnerTarget` (내부 헬퍼)

```typescript
function findRunnerTarget(
  runner:        Player,
  fromBase:      1 | 2 | 3,
  initial_bs:    BallState,   // { phase: 'fielding', ... }
  stealState?:   StealState,
  lineup:        Player[],
): { targetBase: BaseKey; runner_dist: number; t_runner_arrival: number } | null
```

```
currentBase = fromBase
accumulated_t_runner = 0
last_confirmed = null

loop:
  nextBase = currentBase + 1 (또는 'home')
  if nextBase > home → break

  runner_dist = calcRunnerDist(runner, currentBase, nextBase_key, stealState)
  runner_speed = 5.0 + (runner.stats.running / 100) * 3.0
  t_to_next = runner_dist / runner_speed

  // BallState를 runner 이동 시간만큼 조정
  adjusted_bs = adjustBallState(initial_bs, accumulated_t_runner)

  if decideChallengeAdvance(runner, runner_dist, adjusted_bs, nextBase_key, lineup):
    accumulated_t_runner += t_to_next
    last_confirmed = { targetBase: nextBase_key, runner_dist_total, t_arrival: accumulated_t_runner }
    currentBase = nextBase
  else:
    break

return last_confirmed
```

`adjustBallState(bs, t_elapsed)`:
- `fielding` → `t_remaining = max(0, bs.t_remaining - t_elapsed)`. 0이 되면 `held` 전환
- `held` → 변경 없음 (공은 이미 수비수 손에)

---

### `advanceRunners` 시그니처 변경

```typescript
export function advanceRunners(
  result:         AtBatResult,
  runners:        Runners,
  batter:         Player,
  hitPhysics?:    HitResultDetail,
  stealState?:    StealState,
  defenceLineup?: Player[],
  scoreContext?:  { battingScore: number; defenseScore: number },  // 추가
): AdvanceResult
```

- `hitPhysics` 있는 `single`/`double` 분기에서 `resolveLeadingRunner` 대신 `resolveRunnerAdvances` 호출
- `scoreContext`는 `resolveRunnerAdvances`로 전달
- **동작 변화**: 기존 "2루타 2루 주자 → 홈 고정" 규칙이 제거됨. 새 모델에서 느린 주자는 홈 도전 포기 후 3루 정지 가능. 이는 PRD의 의도된 동작 ("타구 판정이 진루 거리를 결정하지 않음")

---

## `half-inning.ts` 스코어 주입

```typescript
const outcome = runAtBat(currentPitcher, batter, {
  outs, runners, inning, isTop,
  familiarity, stamina, recent_pitches, catcher,
  battingScore: isTop ? scoreAway : scoreHome,   // 추가
  defenseScore: isTop ? scoreHome : scoreAway,   // 추가
}, defenceLineup)
```

---

## `at-bat.ts` scoreContext 전달

`advanceRunners` 호출 2곳에 `scoreContext` 추가:

```typescript
// 도루 분기
advanceRunners(result, runners, batter, hit_physics, stealState, defenceLineup,
  { battingScore: ctx.battingScore, defenseScore: ctx.defenseScore })

// 일반 분기
advanceRunners(result, runners, batter, hit_physics, undefined, defenceLineup,
  { battingScore: ctx.battingScore, defenseScore: ctx.defenseScore })
```

---

## 데이터 흐름

```
[half-inning.ts]
  scoreHome / scoreAway
    → AtBatContext { battingScore, defenseScore }
    → runAtBat(pitcher, batter, ctx, defenceLineup)

[at-bat.ts]
  runAtBat()
    → hitBall() → BattingResult { hit_physics }
    → advanceRunners(result, runners, batter, hit_physics, stealState?,
                     defenceLineup, { battingScore, defenseScore })

[runner-advance.ts]
  advanceRunners()
    single / double 분기 (hitPhysics 있음):
      resolveRunnerAdvances(runners, hp, stealState?, defenceLineup?, scoreContext?)
        
        findRunnerTarget(runner, fromBase, ball_state, ...) × 각 주자
          decideChallengeAdvance() → YES/NO per base step
        
        decideThrowTarget(fielder, attempts, ball_state, isCritical, lineup)
          estimateOutProb() × each attempt
          → chosenTarget: BaseKey | null
        
        [주타깃] throwVerdict() → safe/out
        
        [비타깃] free advance → re-decideChallengeAdvance()
          → resolveSecondaryThrow()
            → resolveThrow() → safe/out
            → events.push('secondary_throw', ...)

      → AdvanceResult { nextRunners, runsScored, outs_added, moves }
```

---

## 구현 계획

> **순서 제약**: A 완료 → B 시작 (B는 A의 타입 의존) → C 시작 (C는 B 함수 호출) → D 시작 → E(통합 검증)

### Phase A — 타입 확장
- [ ] `PlayerStats.judgment?: number`
- [ ] `AtBatContext.battingScore/defenseScore`
- [ ] `GameEventType` + `'secondary_throw'`
- [ ] `RunnerMove.return_penalty?`
- [ ] `HitResultDetail.catch_setup_time?`
- [ ] `BallState` 타입 + `Vec2` (`throw-judge.ts`)

### Phase B — `defence/runner-decision.ts` 신규
- [ ] `calcBallArrivalTime` (내부)
- [ ] `estimateOutProb` (내부)
- [ ] `decideChallengeAdvance`
- [ ] `decideThrowTarget`
- [ ] `resolveSecondaryThrow`

### Phase C — `runner-advance.ts` 리팩터
- [ ] `adjustBallState` 헬퍼 (내부)
- [ ] `findRunnerTarget` 헬퍼 (내부)
- [ ] `resolveRunnerAdvances` (기존 `resolveLeadingRunner` 대체)
- [ ] `advanceRunners` 시그니처에 `scoreContext?` 추가 + 호출부 교체

### Phase D — 배선
- [ ] `half-inning.ts` — `battingScore/defenseScore` AtBatContext 주입
- [ ] `at-bat.ts` — `scoreContext` 전달 (2곳)

### Phase E — 검증
- [ ] `tsc --noEmit` 오류 없음
- [ ] `runGame` 9이닝 정상 완주
- [ ] 단타 시나리오: 느린 주자(running 20)가 도전 포기하는 케이스 확인
- [ ] isCritical: 동점 상황에서 수비수가 항상 홈 송구 확인
- [ ] 2차 송구 이벤트 `secondary_throw`가 GameEvent에 등장 확인
- [ ] 기존 `fixedAdvance` (3루타, 홈런) 정상 동작 유지

---

## Risk & Rollback

| # | 리스크 | 대응 |
|---|--------|------|
| R1 | `resolveRunnerAdvances`가 무한 루프 위험 (`findRunnerTarget` 베이스 순환) | `nextBase > 'home'` 조건으로 종료 보장. 베이스 순서 고정 (`1→2→3→home`) |
| R2 | `decideChallengeAdvance`에서 slow runner가 항상 NO → 단타에 주자가 전혀 이동 안 하는 케이스 | `fixedAdvance` fallback은 `hitPhysics` 없을 때만 작동 — hitPhysics 있는 경로에서 이 케이스 발생 시 시뮬 검증 필요 |
| R3 | `scoreContext` 미전달 시 `isCritical` 판단 불가 | `scoreContext` 없으면 `isCritical = false`로 fallback → Rule 1 미발동 (안전한 기본값) |
| R4 | `resolveSecondaryThrow`에서 `receiver` / `receiver_pos` 산출 — 어느 수비수가 1차 송구를 받는지 | 베이스별 수비수 매핑 필요: `home → C`, `1B → 1B`, `2B → 2B or SS`, `3B → 3B`. lineup에서 해당 포지션 탐색, 없으면 dummy |
| R5 | `gaussianNoise` 미구현 | Box-Muller 간단 구현 or `Math.random() * 2 - 1` 균등분포 근사 허용 |
| R6 | `findRunnerTarget`에서 중간 베이스 충돌 (2B runner와 1B runner가 같은 3B 타깃) | `resolveRunnerAdvances`에서 `occupiedBases: Set<BaseKey>` 집합을 관리. 주자 처리 후 배치된 베이스를 추가. `findRunnerTarget` 호출 전 목적 베이스가 이미 점유됐으면 해당 베이스를 skip하고 한 단계 앞에 정지 |

### 롤백 전략
- `advanceRunners`의 `scoreContext?` optional 설계 → 기존 호출부 변경 없이 기존 동작 유지 가능
- Phase C 실패 시: `resolveRunnerAdvances` 미삽입 상태로도 Phase A~B의 타입/함수가 경기 루프에 영향 없음
- `resolveLeadingRunner` 코드는 삭제 전 별도 함수명으로 보관 → 롤백 용이

---

## Phase 6: 데이터 흐름 상세 & 리스크 관리

### 타이밍 변수 출처 표

모든 `t_` 값의 소스와 계산 경로를 명시한다.

| 변수 | 소스 | 계산 |
|------|------|------|
| `hp.t_ball_travel` | `HitResultDetail` | `BallPhysicsResult.t_bounce` (타구 비행 시간) |
| `hp.t_fielding` | `HitResultDetail` | `t_ball_travel + 0.3` |
| `BallState.fielding.t_remaining` | 초기값 = `hp.t_fielding`, 이후 `adjustBallState`가 runner 이동 시간 차감 |
| `t_runner_to_base` | `findRunnerTarget` 내부 | `runner_dist / runner_speed` |
| `t_throw(pos, target)` | `calcBallArrivalTime` 내부 | `shouldUseRelay` 분기: `dist/spd_OF` or relay 경로 합산 |
| `t_first_throw` | `resolveRunnerAdvances` | `hp.t_fielding + dist(fielder_pos, chosenTarget) / spd_OF` (또는 relay 경로) |
| `BallState.throw_in_flight.t_remaining` | 재결정 시 | `max(0, t_first_throw - t_runner_arrival_at_free_base)` |
| `t_secondary_reaction` | 상수 | `0.5s` |

---

### 완전한 데이터 흐름

```
[half-inning.ts]  scoreHome, scoreAway 관리
│
│  isTop=true  → battingScore = scoreAway,  defenseScore = scoreHome
│  isTop=false → battingScore = scoreHome,  defenseScore = scoreAway
│
▼
[at-bat.ts]  runAtBat(pitcher, batter, ctx, defenceLineup)
│  ctx.battingScore, ctx.defenseScore 보유
│
│  hitBall() → BattingResult
│    at_bat_result: 'single' | 'double' | 'out' | ...
│    hit_physics:   HitResultDetail { fielder, fielder_pos, t_fielding, t_ball_travel, is_infield }
│
▼
[runner-advance.ts]  advanceRunners(result, runners, batter, hp, stealState?, lineup, scoreCtx?)
│
│  single/double 분기 (hp 있음):
│  ┌──────────────────────────────────────────────────────────────┐
│  │  resolveRunnerAdvances(runners, hp, stealState, lineup, scoreCtx)
│  │
│  │  1) 초기 BallState 구성
│  │     bs = { phase:'fielding', t_remaining:hp.t_fielding,
│  │            fielder_pos:hp.fielder_pos, fielder:hp.fielder }
│  │
│  │  2) 주자별 최종 목표 결정 (3B → 2B → 1B 순)
│  │     occupiedBases = Set<BaseKey>   ← staying runner 베이스
│  │     attemptedBases = Set<BaseKey>  ← challenging runner 목표
│  │
│  │     findRunnerTarget(runner, fromBase, bs, stealState, lineup, occupied, attempted)
│  │       loop (currentBase → next → next → home):
│  │         runner_dist = calcRunnerDist(runner, currentBase, nextBase, stealState)
│  │         adjusted_bs = adjustBallState(bs, accumulated_t_runner)
│  │         if nextBase ∈ occupiedBases || nextBase ∈ attemptedBases → STOP
│  │         if decideChallengeAdvance(runner, runner_dist, adjusted_bs, nextBase, lineup):
│  │           accumulated_t_runner += runner_dist / runner_speed
│  │           last_confirmed = { target: nextBase, runner_dist_total, t_arrival }
│  │         else → STOP
│  │       return last_confirmed (null = stays)
│  │
│  │     runner stayed    → occupiedBases.add(fromBase)
│  │     runner attempting → attemptedBases.add(target)
│  │                          attempts.push({ runner, target, runner_dist, t_arrival })
│  │
│  │  3) isCritical 계산
│  │     isCritical = attempts.some(a => a.target==='home')
│  │               && (battingScore + 1 >= defenseScore)
│  │
│  │  4) 수비수 타깃 결정
│  │     chosenTarget = decideThrowTarget(fielder, attempts, bs, isCritical, lineup)
│  │       → viable filter (p_out ≥ 0.05)
│  │       → isCritical override
│  │       → judgment sigmoid
│  │
│  │  5) 송구 처리
│  │   [chosenTarget 있음]:
│  │     chosen = attempts.find(a.target === chosenTarget)
│  │     verdict = throwVerdict(fielder, fielder_pos, chosenTarget,
│  │                            hp.t_fielding, chosen.runner, chosen.runner_dist, lineup)
│  │     t_first_throw = hp.t_fielding + dist(fielder_pos, chosenTarget) / effective_speed
│  │
│  │     receiver = findReceiverAtBase(chosenTarget, lineup)
│  │     receiver_pos = BASE_POS[chosenTarget]
│  │
│  │     if verdict === 'out' → outs_added++
│  │     else                 → place runner at chosenTarget; moves.push
│  │
│  │     비타깃 주자 처리:
│  │       for a in attempts where a.target !== chosenTarget:
│  │         place runner at a.target (free advance); moves.push
│  │         // 다음 베이스 재결정
│  │         next_base = getNextBase(a.target)
│  │         if next_base exists:
│  │           t_rem = max(0, t_first_throw - a.t_arrival)
│  │           re_bs = t_rem > 0
│  │                   ? { phase:'throw_in_flight', t_remaining:t_rem,
│  │                       target:chosenTarget, receiver_pos, receiver }
│  │                   : { phase:'held', fielder:receiver, fielder_pos:receiver_pos }
│  │           next_dist = dist(BASE_POS[a.target], BASE_POS[next_base])
│  │           if decideChallengeAdvance(runner, next_dist, re_bs, next_base, lineup):
│  │             result2 = resolveSecondaryThrow(receiver, receiver_pos, next_base,
│  │                                             t_first_throw, runner, next_dist)
│  │             events.push('secondary_throw', { receiver, receiver_pos,
│  │                          target:next_base, challenger:runner, out:result2==='out' })
│  │             if result2 === 'out': outs_added++
│  │             else: move runner from a.target to next_base
│  │
│  │   [chosenTarget 없음]:
│  │     all attempts → free advance (no secondary throw)
│  │
│  │  6) 타자 진루 (기존 로직 유지)
│  │     resolveBatterAdvance(batter, hp) → 1 or 2
│  │     occupied check → place batter at 1B or 2B
│  │
│  │  → AdvanceResult { nextRunners, runsScored, outs_added, moves }
│  └──────────────────────────────────────────────────────────────┘
│
│  fixedAdvance 경로 (hp 없음: triple, home_run, strikeout 등): 변경 없음
▼
[at-bat.ts]  outcome.outs_added, outcome.runs_scored, outcome.next_runners
```

---

### 충돌 시나리오 분석

모든 베이스 점유 패턴과 충돌 해소를 열거한다.

#### Scenario A — 선행 주자가 정지, 후속 주자가 블로킹됨

```
상황: 단타, 2B 주자 staying (판단: throw가 3B에 올 것 같아 정지)
     1B 주자가 2B 도전

처리:
  2B runner → decideChallengeAdvance(3B) = NO → stays
  occupiedBases = {'2B'}
  
  1B runner → findRunnerTarget:
    step 1: 1B→2B: '2B' ∈ occupiedBases → STOP → target = null
  1B runner stays at 1B

  타자 → resolveBatterAdvance → 2B 가능 여부 check:
    next.second ≠ null (2B runner 있음) → 타자 1루 fallback

결과: 2B(원래 주자), 1B(원래 주자), 타자 1루 배치 불가 → 충돌!
```

**충돌 해소**: 1B 주자가 타자 때문에 1B에 머물 수 없다. 단타에서 1B 주자는 **최소 2루로 진루 시도** (batter forces). `findRunnerTarget`에서 1B 주자는 2B가 `occupiedBases`에 있더라도 단타의 경우 2B까지 강제 진루(minimum advance)를 적용한다.

```typescript
// findRunnerTarget 내 single 특수 규칙
if (result === 'single' && fromBase === 1) {
  // 1B 주자는 최소 2루 (타자가 1루 점령)
  // 2B가 점유됐어도 강제 진루 시도 → throw verdict 받음
  forceMinimum2B = true
}
```

→ 이 경우 1B 주자는 `occupiedBases` 무시하고 2B를 타깃으로 `attempts`에 추가. 수비수가 2B에 던지면 throw verdict. 2B 주자와의 충돌(두 주자 동시 2B)은 일어나지 않음: 2B 주자가 staying이면 1B 주자가 2B로 오는 건 rundown 상황 → 1B 주자 out 처리.

**단순화 구현**: 2B가 `occupiedBases`에 있는 상태에서 1B 주자 강제 진루 → `p_out = 1.0` (2루수가 공 없이 태그 대기 가능) 처리. 실제로 이런 상황은 수비수가 2B 주자를 맞히느라 1B 주자 진루를 허용하거나 아닌 경우이므로, `decideThrowTarget`이 2B 주자 vs 1B 주자 중 하나를 선택하는 기존 흐름으로 처리.

---

#### Scenario B — 두 주자가 같은 목표 베이스를 경쟁

```
상황: 단타, 2B 주자가 홈 도전, 1B 주자도 홈까지 가능 (빠른 주자)

처리:
  2B runner → findRunnerTarget:
    2B→3B: YES → 3B→home: YES → target = 'home', t_arrival = t_2B
  attemptedBases = {'home'}

  1B runner → findRunnerTarget:
    1B→2B: YES → 2B→3B: YES →
    3B→home: 'home' ∈ attemptedBases → STOP → target = '3B', t_arrival = t_1B_to_3B

결과: 2B 주자 → 홈, 1B 주자 → 3루
decideThrowTarget: 두 타깃 중 하나 선택
  홈 선택 → 2B 주자 throw verdict, 1B 주자 3루 free advance
  3루 선택 → 1B 주자 throw verdict, 2B 주자 홈 free (득점)
```

`attemptedBases`가 두 주자가 홈에 동시 도달하는 상황을 방지. 1B 주자는 3루에서 멈추고, 2차 송구 기회가 생길 수 있다.

---

#### Scenario C — 모든 주자가 도전

```
상황: 2루타, 만루 (1B+2B+3B)

처리:
  3B runner: 3B→home = YES → home
  2B runner: 2B→home = YES (2루타, 거리 여유) → home
    BUT 'home' ∈ attemptedBases → STOP → 2B→3B만? 아님
    
문제: 2B 주자가 홈을 타깃으로 잡으려는데 3B 주자가 이미 홈을 차지

해소: 실제 야구에서는 두 주자가 홈에 도달하면 둘 다 득점 가능 (순서에 따라).
    2B 주자가 홈 도달 시 3B 주자가 이미 득점해 홈은 비워진 상태.
    → 'home'은 occupiedBases/attemptedBases에서 제외 (득점 처리 후 소멸)

구현: home 베이스는 점유 추적 제외. 복수의 주자가 home을 타깃으로 가능.
    decideThrowTarget이 viable 중 하나만 선택 → 나머지는 free 득점.
```

---

#### Scenario D — 도전 후 safe, 같은 베이스에 다른 주자

```
상황: 단타, 2B 주자 홈 도전 중 아웃 (out)
     1B 주자 3루 도전 → 3루 free (공이 홈으로 갔으니까)

처리:
  2B runner → attempts('home')
  1B runner → attempts('3B')
  decideThrowTarget → 'home'
  2B runner out → nextRunners.home = null (득점 없음)
  1B runner free to 3B → nextRunners.third = 1B runner ✓

충돌 없음: 3루 원래 주자(2B runner)가 이미 아웃됐거나 홈으로 이동했으므로
```

---

#### Scenario E — 2차 송구와 1차 수신자 충돌

```
상황: 수비수 → 홈 송구 (2B 주자 타깃, out)
     1B 주자 → 3루 free advance → 3루 재도전(홈)

처리:
  receiver = catcher (홈 수신자)
  1B 주자 재결정: re_bs = throw_in_flight 또는 held(catcher)
  decideChallengeAdvance('home') → NO (catcher가 공 가짐)
  → 1B 주자 3루 정지 ✓
```

---

#### Scenario F — StealState runner와 findRunnerTarget 충돌

```
상황: 1B 주자 도루 중(to 2B), 타격 발생 → 단타

처리:
  stealState = { runner: 1B runner, base: 1, t_steal_run: 1.8 }
  calcRunnerDist(runner, 1, '2B', stealState):
    steal_progress = runner_speed × 1.8 ≈ 12.5m
    full_dist(1B→2B) ≈ 27.4m
    runner_dist = 27.4 - 12.5 = 14.9m

  findRunnerTarget(runner, fromBase=1, ...):
    step 1: 1→2B, runner_dist=14.9m (올바르게 반영)
    step 2: 2B→3B: stealState.base=1 이므로 더 이상 steal 보정 없음 → 정상 거리

충돌 없음: stealState는 FROM BASE가 일치할 때만 보정 적용
```

---

#### Scenario G — adjustBallState 전환 경계

```
상황: 2B 주자가 3루까지 이동하는 데 hp.t_fielding보다 긴 시간이 걸림
     (예: 매우 느린 주자, 또는 얕은 타구)

처리:
  t_to_3B = dist(2B,3B) / slow_runner_speed ≈ 5.0s
  hp.t_fielding = 3.0s
  adjustBallState(bs, 3.0) → t_remaining = 3.0 - 3.0 = 0 → phase 'held'
  
  2B runner의 3B→home 결정 시:
    BallState = held(fielder, fielder_pos)
    t_ball = dist(fielder_pos, home) / spd
    t_runner = dist(3B, home) / slow_speed ≈ 4.5s
    실제 margin: t_ball(≈2.5s) - t_runner(4.5s) = -2.0s → NO

결과: 느린 주자가 3루에 정지 ✓ (올바른 판정)
```

---

#### Scenario H — chosenTarget null + 전체 free advance

```
상황: 모든 주자가 viability 미만 (아웃 불가)
     decideThrowTarget → null

처리:
  all attempts → free advance to target
  secondary throw 없음 (1차 throw가 발생하지 않음)
  
  각 주자의 target은 findRunnerTarget이 이미 결정한 최대 베이스
  추가 재결정 불필요 (그게 이미 final position)

충돌 없음: occupiedBases/attemptedBases 이미 처리됨
```

---

### 전체 리스크 테이블

| # | 영역 | 리스크 | 심각도 | 해소 전략 |
|---|------|--------|--------|---------|
| R1 | 루프 | `findRunnerTarget` 무한 루프 | 🔴 | 베이스 순서 고정 (1→2→3→home), `nextBase > home` 조건 종료 |
| R2 | 충돌 | 1B 주자 강제 진루 vs occupiedBases | 🔴 | single에서 1B 주자 2B 강제 진루 (minimum advance 예외 처리) |
| R3 | 충돌 | 두 주자 동일 베이스 타깃 | 🔴 | `attemptedBases` 집합으로 선착 주자 우선; home은 제외 |
| R4 | 수신자 | 2차 송구 receiver 위치 불명 | 🟡 | `BASE_POS[chosenTarget]` 사용. 라인업에 해당 포지션 선수 탐색 우선 |
| R5 | 타이밍 | `adjustBallState`에서 `t_remaining` 음수 | 🟡 | `max(0, ...)` 처리 + phase를 `held`로 전환 |
| R6 | 판단 | `gaussianNoise`로 slow runner가 2B도 거부 | 🟡 | Scenario A 해소: single 1B 주자 minimum advance 예외 |
| R7 | 수식 | `estimateOutProb`가 동일 BallState로 모든 주자 평가 | 🟡 | 의도된 동작 — "내가 타깃이라면" 전제 하의 독립 추정 |
| R8 | 베이스 | home을 occupiedBases 추적 시 복수 득점 차단 | 🟡 | home 베이스는 점유 추적 제외 (득점 후 소멸) |
| R9 | 스코어 | `scoreContext` 미전달 시 isCritical 오계산 | 🟢 | `scoreContext` 없으면 `isCritical = false` fallback |
| R10 | 빌드 | Phase B가 Phase A 타입 없이 컴파일 불가 | 🟢 | 순서 제약 명시 (A → B → C → D) |
| R11 | 호환 | `resolveLeadingRunner` 제거로 기존 참조 깨짐 | 🟢 | 삭제 전 이름 보존(`resolveLeadingRunner_legacy`), 참조 검색 후 제거 |
| R12 | 통계 | slow runner가 단타에서 전혀 못 뛰는 극단값 | 🟢 | minimum advance 예외(R2 해소)로 자연 해결 |
| R13 | StealState | 도루 중 주자의 fromBase와 실제 위치 불일치 | 🟢 | `calcRunnerDist`가 stealState.base 일치 시만 보정 — 기존 동작 유지 |
| R14 | 2차 송구 | secondary throw 후 주자 이동이 moves에 누락 | 🟢 | `moves.push` 명시적 호출 — Phase C 구현 체크리스트에 추가 |

---

### 롤백 보강

| Phase | 실패 시 영향 | 롤백 |
|-------|------------|------|
| A (타입) | 타입 오류 — 컴파일 불가 | 타입 추가를 `?` optional로 설계 → 기존 코드 영향 없음 |
| B (함수) | 함수만 추가, 미호출 상태 → 게임 루프 영향 없음 | 파일 삭제 |
| C (리팩터) | `resolveRunnerAdvances` 오류 시 단타/2루타 주자 이동 깨짐 | `resolveLeadingRunner_legacy` 복원 |
| D (배선) | `battingScore/defenseScore` 미전달 → isCritical 항상 false | `scoreContext` 제거 시 기존 동작 복원 |

---

## 테스트 계획

### 핵심 기본 플로우 — 기존 동작 유지 검증

| # | 시나리오 | 기대 결과 |
|---|---------|---------|
| T1 | 주자 없이 단타 | 타자 1루 (또는 2루 진루 판단) |
| T2 | 3루 주자 단타 | 3루 주자 홈 생환 (거의 항상) |
| T3 | 삼진/아웃 | `fixedAdvance` 경로, 주자 이동 없음 |
| T4 | 볼넷 만루 | 강제 진루, 홈 득점 1 |
| T5 | 홈런 | 전 주자 득점 |
| T6 | 9이닝 정상 완주 | 에러 없이 `GameResult` 반환 |
| T7 | #3 중계 기존 동작 유지 | Throw 30 외야수 단타 → relay 발동 |

### 신규 피처 플로우 검증

| # | 시나리오 | 검증 방법 | 기대 결과 |
|---|---------|---------|---------|
| T8 | **느린 주자 도전 포기** | running 10, judgment 70, 2루 단타 (외야 깊숙) | `decideChallengeAdvance` = false → 주자 3루 정지 (홈 도전 포기) |
| T9 | **빠른 주자 홈 도전 성공** | running 95, judgment 80, 2루 단타 | `decideChallengeAdvance` = true → throw verdict → safe 빈도 높음 |
| T10 | **isCritical 홈 우선 송구** | 동점 상황(`battingScore + 1 = defenseScore`), 2루+1루 단타, 2루 주자 홈 도전 | `decideThrowTarget` → 반드시 `'home'` 반환 |
| T11 | **viability 포기 후 타자 저지** | 2루 주자 running 95 (홈 도달 p_out < 5%), 타자 2루 시도 중 (`t_fielding` 짧게 설정) | `decideThrowTarget` → 홈 포기 (`viable` 제외) → 2루로 타깃 전환 |
| T12 | **2차 송구 아웃** | 1루+2루 단타, 수비수 홈 송구, 1루 주자 3루 재도전 | `secondary_throw` 이벤트 발생 + 페이로드 검증 (`receiver`, `target: '3B'`, `challenger`, `out: true/false`) |
| T13 | **2차 송구 safe** | T12와 동일, 1루 주자 running 90 | `secondary_throw.out = false` → 주자 3루 배치 |
| T14 | **베이스 점유 충돌 방지** | 2루+1루 단타, 두 주자 모두 3루 타깃 계산 | 후속 주자가 2루에 정지 (선행 주자 우선) |
| T15 | **low-judgment 수비수 역선택** | judgment 20 수비수, viability 있는 두 타깃 | 최적 타깃 선택 확률 < 50% (통계적 확인, 500회 시뮬) |
| T16 | **judgment 판단 오차** | judgment 30 주자, 아슬아슬한 margin | 잘못된 도전(실제 margin 음수인데 YES) 비율이 judgment 80보다 높음 |

### 검증 방법

- T1~T7, T10~T14: `runGame` 또는 `runAtBat` 직접 호출, 반환값 단언
- T8~T9, T15~T16: 동일 시드 500회 반복 → 통계 비율 확인 (console.log 출력)
- 모든 케이스: `tsc --noEmit` 빌드 오류 없음
