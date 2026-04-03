---
title: "수비 엔진 #3-b — 송구 방향 판단 & 도전 주자 & 추가 송구"
date: 2026-04-01
owner: @dkuzifan
status: draft
series: 수비 엔진 (Defense Engine Module)
---

> **수비 엔진 시리즈**: `#1 포구` ✅ → `#2 송구` ✅ → `#3 중계+공짜진루` ✅ → **`#3-b 송구 방향 판단`** → `#4 병살` → `#5 태그업` → `#6 에러` → `#7 시프트`

---

## Context

### 현재 문제

**#3 완료 이후 남아 있는 문제:**

#### 문제 1 — 수비수가 항상 "선행 주자"에만 던진다

`resolveLeadingRunner`는 가장 앞선 주자(leading runner)를 무조건 타깃으로 삼는다.
실제 야구에서 수비수는 **판단력(judgment)** 에 따라 선행 주자를 포기하고
도전 중인 후속 주자를 잡는 선택을 하기도 한다.

#### 문제 2 — 후속 주자가 항상 +1베이스에서 정지한다

#3의 공짜 진루는 후속 주자를 무조건 +1베이스로 처리한다.
실제로는 주자가 수비수의 송구 방향과 자신의 주루 시간을 어림짐작으로 비교해,
**더 빠를 자신이 있을 때** +2베이스를 능동적으로 도전한다.

```
현재: 1·2루 단타 → 1루 주자 → 2루 FREE (항상 정지)
기대: 주자 판단에 따라 → 3루 도전 시도 가능
```

#### 문제 3 — 첫 번째 송구 후 이동 중인 주자를 잡을 수 없다

첫 번째 송구가 끝난 후 공을 받은 선수가 여전히 이동 중인 다른 주자에게
**추가 송구(2차 송구)**를 하는 플레이가 없다.

```
예: 1·2루 단타 → 수비수 홈 송구 → 포수 공 받음 → 1루 주자 3루 도전 중
   → 포수가 3루로 추가 송구 가능 (현재 없음)
```

---

## Goals / Non-Goals

### Goals (MVP)

**G1. 도전 주자 결정 — 지각 마진 모델 (`decideChallengeAdvance`)**

주자는 자신의 달리기 시간(actual)과 수비수 송구 도달 시간(estimated)을 비교해
**스스로 판단**해서 도전 여부를 결정한다.

```
// 실제 값
actual_t_runner = runner_dist / runner_speed         // 주자가 뛰는 데 드는 실시간
actual_t_throw  = t_fielding + throw_dist / spd_OF   // 또는 relay time

// 어림짐작 오차 (judgment 낮을수록 커짐)
sigma = 0.5 × (1 − judgment / 100)
  judgment 100 → σ = 0.0s  (완벽한 판단, 오차 없음)
  judgment  70 → σ = 0.15s
  judgment  50 → σ = 0.25s
  judgment  30 → σ = 0.35s
  judgment   0 → σ = 0.5s  (매우 부정확한 어림짐작)

// 주자의 인지 마진
actual_margin   = actual_t_throw − actual_t_runner   // 양수 = 주자가 시간적으로 유리
perceived_margin = actual_margin + N(0, σ)

will_challenge = perceived_margin > 0
```

- **Running** 이 높을수록 `actual_t_runner`가 짧아 → 실제로 유리
- **judgment** 가 높을수록 σ가 작아 → "애매한 상황"에서도 올바른 결정
- 마진이 명확하게 양수/음수이면 judgment 관계없이 거의 동일한 결정

> **judgment** = `player.stats.judgment ?? player.stats.defence`
> (별도 judgment 스탯 추가 전까지 defence 스탯 proxy 사용)

**`actual_t_throw` 추정 방법**:
주자는 수비수의 송구 예상 시간을 관찰하여 추정한다.
코드에서는 #3의 `shouldUseRelay` 결과를 바탕으로 실제 throw time을 계산 후 오차 추가.

**G2. 수비수 송구 방향 판단 (`decideThrowTarget`)**

수비수의 judgment 기반으로 "선행 주자 타깃"과 "도전 주자 타깃" 중 하나를 선택.

```
Rule 1 [절대 우선]:
  선행 주자 목적지 = 홈 AND isCritical = true
  → 무조건 홈 (설령 아웃 확률이 낮아도)

Rule 2 [기본]:
  도전 주자 없음 → 선행 주자 타깃 그대로

Rule 3 [판단]:
  도전 주자 있고, Rule 1 해당 없음
  → judgment 기반으로 최적/비최적 타깃 선택
```

**Rule 1 isCritical 정의**:
선행 주자가 홈에 안착하면 동점 또는 역전이 되는 경우.
```
isCritical = leadingRunner.targetBase === 'home'
          && (battingScore + 1 >= defenseScore)
```
`battingScore`, `defenseScore`는 `AtBatContext`에 추가 예정.

**Rule 3 판단 메커니즘**:
```
p_optimal = estimateOutProb(fielder, leadingRunner)
p_challenge_out = estimateOutProb(fielder, challengingRunner)

optimal_target = p_optimal >= p_challenge_out ? leadingTarget : challengingTarget

p_correct = sigmoid((judgment − 50) × 0.05)
  judgment 80 → 82% 확률로 최적 선택
  judgment 50 → 50% (랜덤)
  judgment 30 → 27% (역선택 경향)

chosen_target = random() < p_correct ? optimal_target : suboptimal_target
```

**G3. 비타깃 주자 처리**

| 수비수 선택 | 선행 주자 | 도전 주자 |
|-----------|---------|---------|
| 선행 타깃 | resolveThrow/RelayThrow | **추가 송구 대기** |
| 도전 타깃 | **FREE 진루** (던지지 않음) | resolveThrow/RelayThrow |

**추가 송구 대기 주자**:
수비수가 선행 주자 타깃 선택 시, 도전 중인 후속 주자는 첫 번째 송구 시간 동안 계속 달린다.
첫 번째 송구 완료 후 → G4 추가 송구.

**G4. 추가 송구 (`resolveSecondaryThrow`)**

첫 번째 송구를 받은 선수가 도전 중 주자에게 1회 추가 송구.

```
// 첫 번째 송구 시간 동안 주자가 이미 달린 거리
t_first_throw    = t_fielding + t_throw_primary   // 첫 송구 완료까지 걸린 시간
challenger_run   = runner_speed × t_first_throw
challenger_remaining = max(0, original_runner_dist − challenger_run)

// 추가 송구
t_secondary_reaction = 0.5s  // 공 이미 수중, 회전 + 투구
resolveThrow(receiver, dist_receiver_to_secondary_target,
             t_secondary_reaction, challenger, challenger_remaining)
```

- `receiver` = 첫 번째 송구 타깃 베이스의 수비수 (C, 1B, 2B, 3B, SS)
- 추가 송구는 **최대 1회**

---

### Non-Goals

- **#4 병살**: 2차 송구로 병살 모델링 → 별도 이슈
- **#5 태그업**: 플라이아웃 후 주자 진루 → 별도 이슈
- **뜬 공 포구 불확실성 (M9 전체)**: `BallState.in_air` 타입 예약만. 포구 판단·귀루 페널티·catch_setup_time 구현은 #5 태그업에서 처리
- **별도 judgment 스탯**: 플레이어 스탯 설계 시 추가 예정

---

## Requirements

### Must-have

**M1. `PlayerStats.judgment?: number` 추가**
- `src/lib/baseball/types/player.ts`의 `PlayerStats`에 선택적 필드 `judgment?: number` 추가
- 구현 코드에서 `player.stats.judgment ?? player.stats.defence` 패턴으로 프록시 사용
- 별도 judgment 스탯 설계 완료 시 `?` 제거하고 값 부여하면 됨

**M2. `AtBatContext` 스코어 필드 추가**
- `battingScore: number` — 현재 공격 팀 점수 (공격 중인 팀)
- `defenseScore: number` — 현재 수비 팀 점수
- `isCritical` 계산: `leadTarget === 'home' && (battingScore + 1 >= defenseScore)`
- `HalfInningInit.scoreHome / scoreAway` → `runHalfInning` 내부에서 `AtBatContext` 생성 시 주입

**M3. `decideChallengeAdvance(runner, runner_dist, ball_state, target_base, defenceLineup)` → `boolean`**

주자의 지각 마진 모델. 핵심 입력은 `actual_t_throw`가 아니라 **공의 현재 상태(`BallState`)**다.

```typescript
// t_remaining: 이 결정 시점에서 해당 phase가 완료될 때까지 남은 시간 (s)
// 호출자(M7 루프)가 경과 시간을 추적해 t_remaining을 계산해 전달한다
type BallState =
  | { phase: 'in_air';          t_remaining: number; catch_probability: number;
      fielder_pos: Vec2; fielder: Player }    // ※ 타입 예약 — 실제 구현은 #5
  | { phase: 'fielding';        t_remaining: number;
      fielder_pos: Vec2; fielder: Player }
  | { phase: 'throw_in_flight'; t_remaining: number;
      target: BaseKey; receiver_pos: Vec2; receiver: Player }
  | { phase: 'held';            fielder: Player; fielder_pos: Vec2 }
```

**`t_ball_arrive_at_target` 산출 규칙**:
- `fielding`: `t_remaining + t_throw(fielder_pos, target_base, fielder, lineup)`
  (중계 여부는 `shouldUseRelay`로 판단)
- `throw_in_flight` — **같은 target**: `t_remaining`
- `throw_in_flight` — **다른 target**: `t_remaining + t_relay(receiver_pos, target_base, receiver, lineup)`
- `held`: `t_throw(fielder_pos, target_base, fielder, lineup)` (중계 포함)

```
actual_t_runner = runner_dist / runner_speed
actual_margin   = t_ball_arrive_at_target − actual_t_runner  // 양수 = 주자 유리
sigma           = 0.5 × (1 − judgment / 100)
perceived_margin = actual_margin + N(0, sigma)
return perceived_margin > 0
```

**M4. `estimateOutProb(fielder, runner, runner_dist, ball_state, target, defenceLineup)` → `number`**
- 수비수가 해당 주자를 잡을 확률 추정 (0~1)
- `t_ball_arrive_at_target`은 M3와 동일한 BallState 규칙으로 산출
- relay 여부는 `shouldUseRelay`로 결정. margin → sigmoid → `out_prob = 1 − p_safe`
- `decideThrowTarget`의 내부 헬퍼

**M5. `decideThrowTarget(fielder, runners_attempting, ball_state, isCritical, defenceLineup)` → `BaseKey | null`**

`runners_attempting`: 현재 진루 도전 중인 주자 목록 `Array<{ runner: Player; target: BaseKey; runner_dist: number }>`

판단 순서:

```
Step 1 [viability filter]:
  각 주자에 대해 p_out = estimateOutProb(fielder, runner, ball_state, target, defenceLineup)
  viable_targets = runners_attempting.filter(r => p_out(r) >= VIABILITY_THRESHOLD)  // 예: 0.05
  viable_targets가 비어 있으면 → null 반환 (송구하지 않음, 모두 진루 허용)

Step 2 [isCritical override]:
  viable_targets 중 target === 'home'인 주자가 있고 isCritical → 무조건 그 주자 선택

Step 3 [judgment 기반 선택]:
  viable_targets 중 p_out 최대인 주자 = optimal_target
  p_correct = sigmoid((judgment − 50) × 0.05)
  judgment 80 → 82%  optimal 선택
  judgment 50 → 50%  (랜덤)
  judgment 30 → 27%  (역선택 경향)
  chosen = random() < p_correct ? optimal : suboptimal (viable 중 나머지)
```

> **VIABILITY_THRESHOLD**: 상수 `0.05` (5% 미만 아웃 확률 → 포기). isCritical이 true면 threshold 무시하고 홈으로 던짐.

**M6. `resolveSecondaryThrow(receiver, receiver_pos, secondary_target, t_first_throw, challenger, original_runner_dist)` → `'safe' | 'out'`**
- `challenger_remaining = max(0, original_runner_dist − runner_speed × t_first_throw)`
- `t_secondary_reaction = 0.5s`
- `resolveThrow(receiver, dist(receiver_pos, secondary_target), t_secondary_reaction, challenger, challenger_remaining)` 호출

**M7. 범용 주자 진루 모델 — `resolveRunnerAdvances` (기존 `resolveLeadingRunner` 대체)**

> **핵심 원칙**: 타구 판정(단타/2루타)이 진루 거리를 결정하지 않는다.
> 공의 내야 복귀 속도(t_fielding + 송구 시간)와 주자의 진루 속도를 비교해서 주자 스스로 결정한다.

타구 판정은 **공의 낙하 위치(fielder_pos)와 t_fielding**만 결정한다. 주자의 최종 위치는 `runner_speed`, `judgment`, `t_fielding`, `throw_speed`의 함수다.

**주자 결정 루프** (각 주자, 홈에 가까운 순서부터):
```
현재 베이스 = runner.currentBase
다음 베이스 = 현재 + 1
runner_dist = dist(현재, 다음)

// BallState를 실시간으로 전달
decideChallengeAdvance(runner, runner_dist, ball_state, 다음 베이스, fielder, lineup)
  → YES: 다음 베이스 도전 — runners_attempting 목록에 추가
  → NO:  현재 베이스 정지 (안전, throw 없음)

// 도전자 목록이 확정된 후:
decideThrowTarget(fielder, runners_attempting, ball_state, isCritical, lineup)
  → chosen_target: 해당 주자에게 throw verdict
  → null: 모두 진루 허용

// 비타깃 주자 (공이 다른 베이스로 간 경우):
  해당 주자는 목표 베이스에 무혈 도착 → 다음 베이스를 재결정
  이 시점 BallState = throw_in_flight(다른 베이스) 또는 held(수신자 손)
  → t_ball_arrive_at_next 계산 시 공이 이미 멀리 있으므로 margin이 자동으로 결정됨
  (공이 가까우면 음수 → 도전 포기 / 멀면 양수 → 계속 진루)

// 타깃 주자 safe:
  ball이 target base에 도착 → BallState = held(해당 수비수)
  해당 수비수가 다음 베이스까지 즉시 송구 가능 → margin은 거의 항상 음수
  → 재도전 사실상 불가 (모델이 자동 처리)
```

**필드 송구 결정** (복수 주자가 도전 중일 때):
- 수비수는 `decideThrowTarget`으로 한 명을 선택
- 선택된 주자: throw verdict → safe/out
- 비선택 주자: 이미 달리고 있으면 `resolveSecondaryThrow` 또는 FREE 진루 (G3 규칙)

**케이스 예시**:

| 상황 | 3루 주자 | 2루 주자 | 1루 주자 | 수비수 |
|------|---------|---------|---------|------|
| 단타 | 홈 도전 판단 | 홈 or 3루 판단 | 3루 or 2루 판단 | 최대 1타깃 선택 |
| 2루타 | 홈 도전 판단 | 홈 도전 판단 | 홈 or 3루 판단 | 최대 1타깃 선택 |

> **3루타**: `fixedAdvance` 유지 (hitPhysics 없는 경로 fallback)
> — 3루타는 공이 울타리에 맞거나 갭 깊숙이 파고드는 극단 케이스; `t_fielding`이 길어 거의 모든 주자가 도전 성공하므로 별도 Physics 없이 고정 진루 사용

**`advanceRunners` 시그니처 변경**:
- 6번째 파라미터: `scoreContext?: { battingScore: number; defenseScore: number }` 추가
- `resolveLeadingRunner` 함수는 `resolveRunnerAdvances`로 교체

**M8. `GameEventType` 확장 및 이벤트 로깅**
- `'secondary_throw'` 이벤트 추가: `{ receiver: Player; target: BaseKey; challenger: Player; out: boolean }`
- `resolveSecondaryThrow` 호출 후 events 배열에 push

**M9. #5 태그업을 위한 타입 예약** *(구현은 Non-Goals — #5에서 처리)*

#3-b에서는 타입 인터페이스만 예약한다. 실제 동작 로직은 구현하지 않는다.

```typescript
// HitResultDetail 추가 예약 필드 (hit-ball.ts)
catch_setup_time?: number   // 포구 난이도별 송구 준비 시간. #5에서 계산 로직 추가

// RunnerMove 추가 예약 필드 (runner-advance.ts)
return_penalty?: number     // 진루 중 포구 시 귀루 시간 페널티. #4/#5에서 활용
```

`BallState.in_air`는 M3 타입 정의에 이미 예약됨.

### Nice-to-have

**N1. `isCritical` 범위 확장**
- 현재 정의: 선행 주자 홈 착지 시 동점/역전
- 추후 확장: 2점 이상 차도 "크리티컬"로 간주하는 옵션 파라미터 (`criticality_threshold`)

---

## Success Definition

- Running 80 + judgment 70 주자가 Running 30 + judgment 30 주자보다 통계적으로 더 많은 3루 진출을 성공한다
- 마진이 명확하게 음수인 상황(이길 수 없음이 확실)에서 low-judgment 주자도 도전을 자제한다
- judgment 80 수비수가 낮은 확률의 선행 주자 대신 높은 확률의 도전 주자를 더 자주 선택한다
- isCritical 상황에서 수비수는 항상 홈으로 던진다 (아웃 확률 무관)
- 포수가 3루 추가 송구로 도전 주자를 잡는 플레이가 시뮬레이션에 등장한다
- 기존 경기 루프 정상 동작 유지
