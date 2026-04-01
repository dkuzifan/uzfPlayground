---
title: "수비 엔진 #2 — 송구 판정"
date: 2026-04-01
owner: @dkuzifan
status: draft
series: 수비 엔진 (Defense Engine Module)
---

> **수비 엔진 시리즈**: `#1 포구 판정` ✅ → **`#2 송구 판정`** → `#3 중계 플레이` → `#4 병살` → `#5 태그업` → `#6 에러` → `#7 시프트`

---

## Context

### 현재 문제

`advanceRunners(result, runners, batter)` 는 안타 종류에 따라 **고정 베이스 이동**을 적용한다.

```
single  → 모든 주자 +1루
double  → 모든 주자 +2루
triple  → 모든 주자 +3루
```

결과적으로:
- 수비수의 `Throw` 스탯이 아무런 역할을 하지 않는다
- 주자의 `Running` 스탯이 진루에 영향을 주지 않는다
- 땅볼 아웃도 포구 확률로만 결정되며, 실제 "던져서 잡는" 과정이 없다

### 목표 설계

**베이스 이동을 확률적으로 결정**한다.

```
타구 발생 → 수비수가 공을 처리 → 목표 베이스로 송구
→ 주자 도달 시간 vs 공 도달 시간 비교 → safe | out
```

이 구조가 #3(중계), #4(병살), #5(태그업), #6(에러)의 공통 기반이 된다.

### 베이스 좌표계

필드 좌표계 (홈 플레이트 = 원점, +y = 중견수 방향):

```
HOME   = (  0.0,   0.0 )
1B     = ( 19.4,  19.4 )   ← 27.43m × sin45°, cos45°
2B     = (  0.0,  38.8 )   ← 홈~2루 대각선: 27.43m × √2 = 38.8m
3B     = (−19.4,  19.4 )
```

### 송구 시간 모델

```
throw_speed  = (80 + throw_stat × 0.7) / 3.6    // m/s, Throw 70 → 35.6 m/s
t_throw      = throw_distance / throw_speed

runner_speed = 5.0 + (running / 100) × 3.0       // m/s, Running 70 → 7.1 m/s
t_runner     = remaining_distance / runner_speed
```

```
margin = t_total − t_runner           // 양수 = 주자가 먼저 도달 (safe)
P_safe = sigmoid(margin, scale=0.5)   // 부드러운 확률 전환
```

`t_total`은 **공이 필드에 닿은 시점부터** 송구가 베이스에 도달하는 시간:
```
t_total = t_fielding + t_throw
t_fielding = t_ball_travel + reaction(0.3s)   // #1에서 이미 산출한 값 재사용
```

---

## Goals / Non-Goals

### Goals (MVP)

**G1. 베이스 좌표 상수 테이블 — `BASE_POS`**
- Home / 1B / 2B / 3B 좌표 정의
- 수비수→베이스 throw distance 계산에 사용

**G2. 송구 결과 판정 — `resolveThrow()`**
- `(thrower, throw_dist, t_fielding, runner, runner_dist)` → `'safe' | 'out'`
- Throw 스탯 → 송구 속도 → t_throw 계산
- Running 스탯 → 주자 이동 속도 → t_runner 계산
- margin 기반 확률 산출 → 결과 반환

**G3. 내야 땅볼 → 1루 송구**
- 포구 판정(#1)과 송구 판정(#2)을 **2단계 흐름**으로 처리:
  1. `calcCatchProbability` → 포구 성공 여부 (기존)
  2. 포구 성공 시 → `resolveThrow` → safe | out
- 포구 실패 시 → 에러 처리 (#6)로 위임, 이번 범위에서는 포구 실패 = 단타로 처리
- 타자 주자의 1루 도달 시간: `27.43m / runner_speed`

**G4. 외야 안타 → 여분 진루 시도 판정**
- 현재 고정 룰(`single=+1, double=+2`)을 확률적 진루로 교체

**기존 주자 여분 진루 판정 (leading runner 우선)**:
- single: 2루 주자의 홈 진루 시도, 1루 주자의 3루 진루 시도 → `resolveThrow` 판정
- double: 1루 주자의 홈 진루 시도 → `resolveThrow` 판정
- **주자 우선순위**: 가장 앞선 주자(leading runner)를 먼저 판정. 수비수는 1개 베이스만 선택해 실제 송구
- 외야수→목표 베이스 throw_dist 계산 후 판정

**타자 본인 추가 진루 판정 (독립 평가)**:
- **판정 원칙**: 수비수의 실제 송구 방향과 무관하게, 타자의 추가 진루는 **가상 송구**로 독립 평가
  - "수비수가 타자 기준 다음 베이스로 던진다면, 타자가 이길 수 있는가?"를 판정
  - 수비수가 실제로 3루에 던지는 사이 타자가 2루에 앉더라도, 이것은 자력 2루타가 아님
  - 가상 판정을 통과해야만 타자가 그 베이스를 **번 것**으로 처리

- **결정 시점**: 공이 착지하는 순간 (`t_bounce`)
  - 이 시점에 타자가 이미 뛴 거리: `batter_run = runner_speed × t_ball_travel`
  - 이 시점부터 수비수 반응(0.3s) + 이동 + 송구까지가 타자의 "여분 시간"

- **아크 주루 모델** (외야 안타 한정):
  - 외야 안타 타자는 1루를 지나쳐 overrun 후, 2루 도전 or 귀루를 결정하는 아크 경로

  - **overrun_dist는 고정값이 아님** — 타구 깊이와 Running 스탯으로 결정:
    ```
    run_intensity = clamp(t_ball_travel / 3.0, 0.7, 1.0)
                    // 얕은 타구 → 보수적 주루(0.7), 깊은 타구 → 전력 질주(1.0)
    overrun_dist  = run_intensity × runner_speed × k   // k ≈ 0.3s (제동 반응 시간)
    ```
    - Running 30 + 얕은 타구 ≈ 1.2m / Running 90 + 깊은 타구 ≈ 2.3m (5~10% 범위 내)

  - `t_bounce` 시점 타자 위치에 따라 2루까지 남은 거리(`remaining_to_2B`) 계산:
    - `batter_run < 27.43m` (아직 1루 전): 남은 1루 거리 + overrun_dist + overrun 지점→2루 직선 거리
    - `batter_run >= 27.43m` (overrun 중): 현재 위치에서 2루까지 직선 거리
  - overrun 지점 좌표: `overrun_pos = 1B_pos + normalize(1B_pos) × overrun_dist`
  - `remaining_to_2B = dist(overrun_pos, 2B_pos)` 가 `resolveThrow`의 `runner_dist`로 사용됨

  - **효과**: Running 높은 타자 → 빠른 속도로 더 멀리 뛰어 1루에 일찍 도달 + `remaining_to_2B` 짧아짐; 깊은 타구 → `t_ball_travel` 길어 타자가 이미 1루 지난 상태

- **내야 안타는 직선 주루**:
  - `runner_dist = 27.43m` — 1루 세이프 여부만 판정
  - 아크 없음, 추가 진루 없음. `resolveThrow → 'safe' | 'out'` 하나로 종결
  - 현실의 1루 오버런은 시뮬레이션과 무관하므로 무시
- **외야 단타 타자의 2루 추가 진루 시도** → 아크 모델 적용 후 `resolveThrow(outfielder, dist_to_2B, t_fielding, batter, remaining_to_2B)`

**G5. `advanceRunners` 시그니처 확장**
- 기존: `(result, runners, batter)`
- 변경: `(result, runners, batter, fielder?, landing?, t_fielding?)` — optional로 backward compat 유지
- fielder 없으면 기존 고정 룰 동작 (fallback)

---

### Non-Goals

- **중계 플레이**: `#3` 에서 구현 (외야→중계수→베이스 2단 송구)
- **병살**: `#4` 에서 구현
- **태그업**: `#5` 에서 구현
- **송구 에러 (와일드 스로, 쇼트 바운드)**: `#6` 에서 구현
- **시프트**: `#7` 에서 구현
- **주자 2명 이상 동시 진루 판정**: 최선두 주자 1명만 판정 (수비수가 한 베이스만 선택)
- **"공짜 진루" 모델링**: 수비수가 다른 주자에게 던지는 사이 타자가 베이스를 자동으로 얻는 케이스 — `#3` 중계 플레이에서 수비수 실제 송구 선택과 함께 처리
- **타자 본인 3루 진루**: 단타 후 3루 진루 시도, 2루타 후 홈인 시도 등 — `#2` 범위 외 (향후 고도화)

---

## Success Definition

- Running 80 주자가 Running 50 주자보다 통계적으로 더 많은 여분 진루(extra base)를 성공한다
- Throw 80 수비수가 Throw 50 수비수보다 통계적으로 더 많은 베이스 아웃을 만든다
- 내야 땅볼에서 빠른 타자(Running 90+)가 간헐적으로 내야 안타를 기록한다
- 기존 경기 루프(`runGame`) 정상 동작 유지

---

## UX Acceptance Criteria

해당 없음 (순수 엔진 피처).

---

## User Flow

해당 없음 (엔진 내부 변경).

---

## Requirements

### Must-have

**R1. `BASE_POS` 상수 테이블**
- Home / 1B / 2B / 3B 좌표를 `src/lib/baseball/defence/` 에 상수로 정의
- 수비수 포지션 → 베이스 throw_distance 계산에 사용

**R2. `resolveThrow()` 함수**
- 시그니처: `(thrower: Player, throw_dist: number, t_fielding: number, runner: Player, runner_dist: number) → 'safe' | 'out'`
- `throw_speed = (80 + throw_stat × 0.7) / 3.6` (m/s)
- `runner_speed = 5.0 + (running / 100) × 3.0` (m/s)
- `t_throw = throw_dist / throw_speed`
- `t_runner = runner_dist / runner_speed`
- `margin = (t_fielding + t_throw) − t_runner`
- `P_safe = sigmoid(margin, scale=0.5)` → 확률로 safe/out 결정

**R3. 내야 땅볼 — 1루 송구 2단계 판정**
- 1단계: `calcCatchProbability` → 포구 성공 여부 (기존 #1 로직)
- 2단계: 포구 성공 시 `resolveThrow(fielder, dist_to_1B, t_fielding, batter, 27.43)` → safe | out
- 포구 실패 시: 단타로 처리 (에러는 #6에서)
- `dist_to_1B` = 담당 수비수 위치 → 1루 좌표 유클리드 거리

**R4. 외야 안타 — 기존 주자 여분 진루 판정**
- single: 2루 주자 → 홈 진루 시도, 1루 주자 → 3루 진루 시도
- double: 1루 주자 → 홈 진루 시도
- 각각 `resolveThrow(outfielder, dist_to_target, t_fielding, runner, remaining_dist)` 판정
- leading runner 우선 — 수비수는 가장 앞선 주자 베이스로 실제 송구

**주자 출발 위치 — 세컨더리 리드 반영**:
- 타격 발생 시점에 주자는 세컨더리 리드(투구 중 확장된 리드) 위치에 있음
- `static_lead = 1.5 + (running / 100) × 1.5` (m) — Running 30: 1.95m / Running 90: 2.85m
- `pitch_lead = static_lead × 2.0` — 세컨더리 리드: Running 30: 3.9m / Running 90: 5.7m
- `remaining_dist = base_to_target_dist - pitch_lead`

**도루 중인 주자 케이스**:
- 도루 시도 중 타격 발생 시, 주자는 이미 전력 질주 중
- 이미 진행한 거리: `steal_progress = runner_speed × t_steal_run`
  - `t_steal_run ≈ 1.8s` (투수 딜리버리 ~1.4s + 투구 비행 ~0.43s 고정 근사)
- `remaining_dist = base_to_target_dist - steal_progress`
- 도루 중 주자는 이미 최고 속도 → `runner_speed` 그대로 적용 (가속 단계 없음)

**R5. 외야 단타 — 타자 추가 진루 판정 (독립 평가)**
- 결정 시점: `t_bounce` (공 착지 순간)
- 타자의 `t_ball_travel` 동안 이미 뛴 거리: `batter_run = runner_speed × t_ball_travel`
- `overrun_dist = clamp(t_ball_travel / 3.0, 0.7, 1.0) × runner_speed × 0.3`
- `overrun_pos = 1B_pos + normalize(1B_pos) × overrun_dist`
- `remaining_to_2B = dist(overrun_pos, 2B_pos)` (단, `batter_run >= 27.43m` 이면 현재 위치에서 계산)
- 수비수의 실제 송구 방향과 무관하게 **가상 2루 송구**로 독립 평가:
  `resolveThrow(outfielder, dist_to_2B, t_fielding, batter, remaining_to_2B)`
- safe → 타자 2루 안착 (2루타로 기록)
- out → 타자 1루 유지

**R6. `advanceRunners` 시그니처 확장**
- 기존: `(result, runners, batter)`
- 변경: `(result, runners, batter, fielder?, landing?, t_fielding?, t_ball_travel?)` — optional, backward compat 유지
- fielder 없으면 기존 고정 룰 fallback

**R7. `resolveHitResult` 반환 타입 확장**
- 기존: `AtBatResult` (string)
- 변경: `{ result: AtBatResult, fielder: Player, landing: FieldCoords, t_fielding: number, t_ball_travel: number }`
- `advanceRunners`에 전달하기 위한 데이터 흐름 연결
- 호출부(`hit-ball.ts`)에서 반환값 구조 변경 대응 필요

---

### Nice-to-have

**N1. 내야 안타 판정에서 hit type 업그레이드**
- 현재 `resolveHitType(range)`에서 내야 범위(range < 36m)는 항상 single 반환
- `resolveThrow` 결과가 safe이면 내야 안타 단타로 기록 — 이미 동일하므로 추가 변경 없음

**N2. 수비수 포지션별 throw_dist 사전 계산 캐시**
- 매 플레이마다 유클리드 거리를 재계산하는 대신 포지션→베이스 거리를 미리 계산해 테이블로 저장
- 성능 영향이 미미하므로 필수는 아님

---

## Implementation Plan

### Phase A — 기반 구조 (신규 파일)

- [ ] `defence/types.ts`에 `HitResultDetail` 인터페이스 추가
- [ ] `defence/throw-judge.ts` 생성
  - [ ] `BASE_POS` 상수 (HOME / 1B / 2B / 3B)
  - [ ] `resolveThrow(thrower, throw_dist, t_fielding, runner, runner_dist)` 구현
  - [ ] `calcOverrunDist(t_ball_travel, runner)` 구현
  - [ ] `calcRemainingTo2B(t_ball_travel, batter)` 구현

### Phase B — 데이터 흐름 연결

- [ ] `batting/hit-result.ts`: `resolveHitResult` 반환 타입 → `HitResultDetail`
  - `fielder`, `fielder_pos`, `t_fielding`, `t_ball_travel`, `is_infield` 포함
- [ ] `batting/types.ts`: `BattingResult`에 `hit_physics?: HitResultDetail` 추가
- [ ] `batting/hit-ball.ts`: `resolveHitResult` 반환값 → `hit_physics`로 전달

### Phase C — `advanceRunners` 확장

- [ ] `runner-advance.ts`에 `StealState` 인터페이스 추가
- [ ] `advanceRunners` 시그니처 확장 (`hitPhysics?`, `stealState?`)
- [ ] 내부 helper 구현
  - [ ] `calcRunnerDist(runner, fromBase, targetBase, hitPhysics, stealState)` — 주자 출발 거리 계산
  - [ ] `resolveLeadingRunner(runners, fielder, hitPhysics, stealState)` — leading runner 진루 판정
  - [ ] `resolveBatterAdvance(batter, fielder, hitPhysics)` — 타자 추가 진루 독립 판정
- [ ] `advanceRunners` 본체: single / double 분기에 helper 연결
- [ ] `hitPhysics` 없으면 기존 고정 룰 fallback 동작 확인

### Phase D — `at-bat.ts` 흐름 수정

- [ ] 도루 분기: `batting.at_bat_over` 체크를 도루 판정보다 **먼저** 수행하도록 순서 변경
  - 타격 발생 시 → 도루 판정 스킵, `stealState` 전달해 `advanceRunners` 호출
  - 타격 없을 시 → 기존 도루 성공/실패 판정 유지
- [ ] 일반 분기: `advanceRunners` 호출에 `batting.hit_physics` 추가
- [ ] caught_stealing 버그(타격이 도루 결과에 덮어씌워지던 문제) 수정 확인

### Phase E — 검증

- [ ] `tsc --noEmit` 빌드 오류 없음
- [ ] `runGame` 정상 동작 (9이닝 완주, 스코어 기록)
- [ ] Running 80 vs Running 50 — extra base 성공률 차이 확인
- [ ] Throw 80 vs Throw 50 — 베이스 아웃 비율 차이 확인
- [ ] Running 90+ 타자 내야 안타 간헐적 발생 확인

---

## Risk & Rollback

### 데이터 흐름 요약

```
[hit-result.ts]
  resolveHitResult()
    → HitResultDetail { result, fielder, fielder_pos, t_fielding, t_ball_travel, is_infield }

[hit-ball.ts]
  hitBall()
    → BattingResult { at_bat_result, hit_physics: HitResultDetail }

[at-bat.ts] 도루 분기
  batting = hitBall()
  if batting.at_bat_over:
    → advanceRunners(result, runners, batter, hit_physics, stealState)  ← 타격 우선
  else:
    → resolveSteal()  ← 타격 없을 때만 도루 판정

[at-bat.ts] 일반 분기
  → advanceRunners(result, runners, batter, hit_physics)

[runner-advance.ts]
  advanceRunners()
    calcRunnerDist()      → remaining_dist (세컨더리 리드 / 도루 midrun / 타자 아크)
    resolveLeadingRunner() → leading runner safe|out  (실제 송구)
    resolveBatterAdvance() → batter extra base safe|out  (가상 송구)
    → AdvanceResult { nextRunners, runsScored, moves }
```

---

### 리스크 & 롤백

| # | 리스크 | 영향 | 대응 |
|---|--------|------|------|
| R1 | `hitPhysics` undefined — strikeout/walk 등 타격이 없는 결과에서 접근 시 런타임 오류 | 높음 | `advanceRunners` 진입 시 `hitPhysics` undefined 체크 → 기존 고정 룰 fallback |
| R2 | `defenceLineup` 빈 배열 → dummy fielder 반환 → throw_dist 계산 부정확 | 중간 | dummy Throw 70 기본값으로 처리, `console.warn` 유지. 호출부에서 lineup 전달 보장 |
| R3 | 도루 분기 순서 변경으로 기존 도루 이벤트 로깅 누락 가능성 | 중간 | 타격 발생 시에도 `steal_attempt` 이벤트는 이미 push된 상태 — 추가 로그 불필요 확인 |
| R4 | `calcRemainingTo2B`에서 `batter_run > 27.43m` 케이스 미처리 시 음수 거리 발생 | 높음 | `Math.max(0, ...)` clamp 처리 필수 |
| R5 | `resolveHitResult` 반환 타입 변경 → 기존 호출부(`hit-ball.ts`) 컴파일 오류 | 높음 | Phase B에서 hit-ball.ts 동시 수정, `tsc --noEmit`으로 즉시 확인 |

### 롤백 전략

`hitPhysics` optional 파라미터 설계 덕분에 단계별 롤백 가능:
- Phase A~B 완료 후 C 실패 시: `advanceRunners`는 기존 고정 룰 그대로 동작 → 경기 루프 유지
- Phase D 실패 시: 도루 분기만 이전 코드로 되돌리면 됨 (일반 분기는 독립적)
- 전체 롤백 필요 시: `resolveHitResult` 반환 타입을 `AtBatResult`로 되돌리는 한 줄 변경으로 원상복구
