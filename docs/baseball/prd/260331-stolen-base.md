---
title: 야구 시뮬레이터 — 도루 / 견제
date: 2026-03-31
owner: @dkuzifan
status: draft
---

## Context

현재 도루(`bunt-stub.ts` 아님, 별도 미구현)와 견제(`pickoff-stub.ts`)는 모두 항상 false를 반환하는 stub 상태다.
Simulator_20240507.md에 도루 시도 확률, 성공 확률 공식이 구체적으로 정의되어 있어 공식 기반 구현이 가능하다.

도루/견제 구현에는 두 가지 설계 변경이 필요하다:
1. **포수 스탯 접근**: 도루 성공 확률에 포수 `defence`/`throw` 스탯 필요 → lineup에서 `position_1 === 'C'`로 자동 탐색
2. **타석 중 주자 변경**: 현재 `runAtBat`은 주자를 타석 내내 고정으로 봄 → `currentRunners`를 mutable하게 관리하도록 수정

### 관련 문서
- `docs/baseball/check/Simulator_20240507.md` — 도루/견제 공식 전체
- `src/lib/baseball/engine/pickoff-stub.ts` — 견제 stub (교체 대상)
- `src/lib/baseball/game/at-bat.ts` — 수정 대상 (주자 mutable 처리)

---

## MVP 범위 결정

도루와 견제를 **한 피처에 통합**하되, 우선순위를 명확히 구분한다:

- **Must-have**: 도루 시도/성공 판정, 포수 스탯 연동
- **Must-have**: 견제 시도/결과 판정 (기본 공식)
- **Non-goal**: 견제 실패 후 도루 확률 연동 패널티 (Nice-to-have로 이월)

---

## Goals / Non-Goals

**Goals (MVP):**
- **G1** 도루 시도 확률 계산 (1루→2루, 2루→3루, Simulator 공식)
- **G2** 도루 성공 확률 계산 (포수 defence/throw, 투구 구속, 헛스윙 보정)
- **G3** 도루 결과 반영: 성공 시 주자 진루, 실패 시 주자 소멸 + out
- **G4** 견제 시도 확률 계산 + 결과 판정 (투수 OVR vs 주자 running)
- **G5** 견제 성공 시 주자 소멸 + out, 실패 시 주자 잔류
- **G6** `steal_attempt`, `steal_result`, `pickoff_attempt`, `pickoff_result` GameEvent 추가
- **G7** lineup에서 포수 자동 탐색 (`position_1 === 'C'`, 없으면 lineup[1])

**Non-Goals:**
- 견제 실패 후 도루 확률 패널티 (-10% × 시도 횟수) — 나중에 고도화
- 3루 주자 단독 홈스틸 — 별도 기획 (1+3루 더블 스틸에서의 홈 쇄도는 포함)
- 도루 통계 누적 (SB/CS) — 스탯 기록 피처에서 처리
- 번트 (bunt-stub 유지)
- 태그업

---

## 도루 공식 (Simulator_20240507.md 기반)

### 도루 타이밍
- 각 투구 직후 (throwPitch 완료, hitBall 결과와 함께) 처리
- 도루 시도 가능 주자: 1루 주자 → 2루, 2루 주자 → 3루 (3루 주자 X)
- 볼카운트 무관하게 매 투구마다 체크

### 도루 시도 확률
```
조건: 주자 running >= avg(투수 ball_speed, 포수 throw)

1루 주자 시도율 = 0.15 + [(running - avg(투수ball_speed, 포수throw))^0.4 * 0.01]
2루 주자 시도율 = 0.05 + [(running - avg(투수ball_speed, 포수throw))^0.4 * 0.01]
```

### 도루 성공 확률
```
기본 = 0.5 + (running - avg(구종ball_speed, 포수defence, 포수throw)) * 0.01

보정:
- 헛스윙 발생 시: × 0.95  (포수 송구 유리)
- 3루 도루 시:     × 1.10  (3루선 송구 거리 불리)
- 3루 도루 + 헛스윙: × 0.95 × 1.10
```

### 볼넷/HBP 시 처리
- 도루 중 주자가 자동 진루 대상 → 도루 결과 없이 그냥 진루
- 도루 중 주자가 자동 진루 대상 아님 + 볼넷 → 도루 결과 체크
- HBP 상황 → 도루 결과 없이 원래 베이스에 고정

---

## 견제 공식 (Simulator_20240507.md 기반)

### 견제 가능 상황 (투구 전 체크)
| 주자 상황 | 견제 위치 |
|----------|---------|
| 1루만 | 1루 |
| 2루만 | 2루 |
| 1+2루 | 2루 |
| 1+3루 | 1루 |
| 3루 / 2+3루 / 만루 | 없음 (견제 X) |

### 견제 시도 확률
```
견제 확률 = 2 + sqrt(주자 running) * (0.18^3)
```

### 견제 결과 OUT 확률
```
투수 OVR 확률 = (투수 ball_control * 1e-7) ^ 0.52
주자 주루 확률 = (주자 running * 0.00013) ^ 2

OUT 확률 = max(0, 투수OVR확률 - 주자주루확률)
```

---

## Success Definition

- 100경기 시뮬에서 `steal_attempt` 이벤트 발생 확인 (MLB 평균 팀당 약 0.5~1회/경기)
- 도루 성공률 60~75% 범위 (MLB 평균 약 78%, 초기 MVP는 낮을 수 있음)
- `npx tsc --noEmit` 통과

---

## Requirements

### Must-have

**R1. 포수 탐색 유틸 (`game/util.ts` 신규)**
- `findCatcher(lineup: Player[]): Player`
- `position_1 === 'C'`인 선수 반환, 없으면 `lineup[1]`

**R2. `AtBatContext` 확장 (`game/types.ts`)**
- `catcher: Player` 추가
- `runHalfInning`이 lineup에서 포수 탐색 후 전달

**R3. `runAtBat` 내부 주자 mutable 처리 (`game/at-bat.ts`)**
- `let currentRunners = { ...ctx.runners }` 로 타석 내 주자 상태 추적
- 견제 성공 / 도루 결과로 `currentRunners` 업데이트
- 타석 종료 시 `advanceRunners(result, currentRunners, batter)` 호출 (기존 `ctx.runners` 대신)

**R4. `AtBatResult` 타입 확장 (`batting/types.ts`)**
- `'pickoff_out'` — 견제 성공 (타석 중단, out)
- `'caught_stealing'` — 도루 실패 (타석 중단, out)

**R5. 도루 로직 (`game/stolen-base.ts` 신규)**
- 더블 스틸 가능 — 여러 주자가 동시에 도루 시도 가능
- **포수 송구는 선행 주자 우선** (더 득점에 가까운 주자):
  - 1+2루: 포수 → 3루 송구(2루 주자 우선). 2루 주자 결과에 따라 1루 주자도 2루 진루
  - 1+3루: 포수 → 3루 주자 홈 쇄도 성공률로 송구 결정 (pitch-batter-interaction.md Section 15-5 기준)
    - P(홈 쇄도 성공) > 0.5 → 포수 송구 안 함 → 1루 주자 2루 세이프
    - P ≤ 0.5 → 포수 2루 송구 → 3루 주자 P > 0.45이면 홈 쇄도 독립 판정
- `decideStealAttempt(runner, base, pitcher, catcher, pickoutCount): boolean`
  - 시도 조건: `runner.running >= avg(pitcher.ball_speed, catcher.throw)`
  - 1루 시도율: `(0.15 + [(running - avg)^0.4 × 0.01]) × 0.9^pickoutCount`
  - 2루 시도율: `(0.05 + [(running - avg)^0.4 × 0.01]) × 0.9^pickoutCount`
- `resolveStealResult(runner, base, pitch, catcher, isSwingAndMiss, pickoutCount): 'success'|'caught'`
  - `adjustedRunning = runner.running - (pickoutCount × 10)`
  - 기본: `0.5 + (adjustedRunning - avg(pitch.ball_speed, catcher.defence, catcher.throw)) × 0.01`
  - 헛스윙: × 0.95 / 3루 도루: × 1.10

**R6. 견제 로직 (`engine/pickoff.ts` — stub 교체)**
- `decidePickoff(pitcher, runners): { attempt: boolean; base: 1|2|null }`
  - 견제 가능 상황만: 1루만→1루, 2루만→2루, 1+2루→2루, 1+3루→1루
  - 견제 확률: `2 + sqrt(주자.running) × (0.18³)` (%)
- `resolvePickoff(pitcher, runner): 'out'|'safe'`
  - OUT 확률: `max(0, (pitcher.ball_control × 1e-7)^0.52 - (runner.running × 0.00013)^2)`

**R7. `GameEventType` 확장 (`game/types.ts`)**
- `'steal_attempt'`, `'steal_result'`, `'pickoff_attempt'`, `'pickoff_result'` 추가

**R8. `runAtBat` 루프 흐름 (`game/at-bat.ts`)**
```
loop:
  1. [투구 전] decidePickoff → 시도 시 resolvePickoff
     - out: pickoff_out early return (outs_added:1)
     - safe: pickoutCount++, currentRunners 유지
  2. throwPitch
  3. [투구 후] decideStealAttempt (1루/2루 주자 각각)
     → 시도 시 resolveStealResult(isSwingAndMiss 반영)
     - caught: caught_stealing early return (outs_added:1)
     - success: currentRunners 업데이트, steal_result 이벤트
  4. hitBall → 볼넷/HBP 처리 (자동진루 주자는 도루 결과 무시)
  5. at_bat_over → advanceRunners(currentRunners 기준)
```

**R9. Early return 공통 구조**
- `outs_added: 1`, `runs_scored: 0`, 주자 소멸 반영 `next_runners`
- `runHalfInning` 기존 outs 누산 로직 재사용 (변경 없음)

**R10. 견제 실패 이중 패널티 (타석 내 유효, 다음 타석 리셋)**
- `pickoutCount` 타석 내 추적
- 도루 시도 확률 × `0.9^pickoutCount`
- 도루 성공 공식 running → `runner.running - (pickoutCount × 10)`

### Nice-to-have
- N1. 만루 시 견제 위치 없음 처리 (현재 주자 상황 테이블 완전 구현)
