---
title: 야구 시뮬레이터 — 도루/견제 Tech Spec
date: 2026-03-31
prd: docs/baseball/prd/260331-stolen-base.md
status: draft
---

## 의존성 분석 및 기술 설계

- **API**: 없음 — 순수 TypeScript 엔진
- **DB**: 없음
- **Release Strategy**: 직접 main push

---

## 수정/신규 파일 목록

| 파일 | 유형 | 내용 |
|------|------|------|
| `batting/types.ts` | 수정 | `AtBatResult`에 `'pickoff_out'`, `'caught_stealing'` 추가 |
| `game/types.ts` | 수정 | `GameEventType` 확장, `AtBatContext.catcher` 추가 |
| `game/util.ts` | 신규 | `findCatcher(lineup)` |
| `game/stolen-base.ts` | 신규 | 도루 시도/성공 판정 |
| `engine/pickoff.ts` | 신규 | 견제 시도/성공 판정 (stub 교체) |
| `engine/pickoff-stub.ts` | 삭제 | pickoff.ts로 대체 |
| `game/at-bat.ts` | 수정 | currentRunners mutable, 견제/도루 루프 삽입 |
| `game/half-inning.ts` | 수정 | findCatcher로 포수 탐색, AtBatContext에 전달 |

---

## 타입 변경

### `batting/types.ts`
```typescript
export type AtBatResult =
  | 'in_progress'
  | 'strikeout'
  | 'walk'
  | 'hit_by_pitch'
  | 'single'
  | 'double'
  | 'triple'
  | 'home_run'
  | 'out'
  | 'pickoff_out'       // ← 신규: 견제 성공
  | 'caught_stealing'   // ← 신규: 도루 실패
```

### `game/types.ts`
```typescript
// AtBatContext — catcher 추가
export interface AtBatContext {
  outs:           number
  runners:        Runners
  inning:         number
  isTop:          boolean
  familiarity:    FamiliarityMap
  stamina:        number
  recent_pitches: Array<{ type: PitchType; zone: ZoneId }>
  catcher:        Player   // ← 신규
}

// GameEventType 확장
export type GameEventType =
  | 'pitch'
  | 'at_bat_result'
  | 'runner_advance'
  | 'score'
  | 'inning_start'
  | 'inning_end'
  | 'pitching_change'
  | 'steal_attempt'     // ← 신규
  | 'steal_result'      // ← 신규
  | 'pickoff_attempt'   // ← 신규
  | 'pickoff_result'    // ← 신규
  | 'game_end'

// payload 명세 추가:
//   steal_attempt  → { runner: Player; from: 1|2 }
//   steal_result   → { runner: Player; from: 1|2; to: 2|3|'home'; success: boolean }
//   pickoff_attempt→ { pitcher: Player; runner: Player; base: 1|2 }
//   pickoff_result → { runner: Player; base: 1|2; out: boolean }
```

---

## `game/util.ts` (신규)

```typescript
export function findCatcher(lineup: Player[]): Player {
  return lineup.find(p => p.position_1 === 'C') ?? lineup[1]
}
```

---

## `game/stolen-base.ts` (신규)

### 도루 시도 판정
```typescript
export function decideStealAttempt(
  runner:       Player,
  base:         1 | 2,          // 현재 루 (1루→2루 도루, 2루→3루 도루)
  pitcher:      Player,
  catcher:      Player,
  pickoutCount: number,          // 이 타석에서 견제 시도 횟수
): boolean

// 로직:
// 조건: runner.stats.running >= avg(pitcher.stats.ball_speed, catcher.stats.throw)
// 시도율 base: base===1 ? 0.15 : 0.05
// 시도율 = (base + [(running - avg)^0.4 * 0.01]) * 0.9^pickoutCount
// clamp(0, 1)
```

### 도루 성공 판정
```typescript
export function resolveStealResult(
  runner:         Player,
  to:             2 | 3 | 'home',
  pitch:          PitchResult,
  catcher:        Player,
  isSwingAndMiss: boolean,
  pickoutCount:   number,
): 'success' | 'caught'

// 로직:
// adjustedRunning = runner.stats.running - (pickoutCount * 10)
// avg3 = avg(pitch.ball_speed, catcher.stats.defence, catcher.stats.throw)
//   ※ pitch.ball_speed: PitchResult의 실제 구속 (ball_speed 필드 — engine/types.ts 확인)
// base = 0.5 + (adjustedRunning - avg3) * 0.01
// if isSwingAndMiss: base *= 0.95
// if to === 3 or to === 'home': base *= 1.10
// success = Math.random() < clamp(0, 1, base)
```

### 포수 송구 결정 (더블 스틸)
```typescript
export function decideCatcherThrow(
  runners:  Runners,
  catcher:  Player,
  pitcher:  Player,
  pitch:    PitchResult,
): { throwBase: 2 | 3 | 'home' | null; targetRunner: Player | null }

// 우선순위: 선행 주자 기준 송구
// 예외: 아주 드문 케이스(역방향 송구)는 MVP에서 미구현
//
// 1+3루: P(3루주자 홈 쇄도 성공) 계산
//   > 0.50 → 포수 송구 안 함 (throwBase: null)
//   ≤ 0.50 → 2루 송구 (throwBase: 2, targetRunner: runners.first)
//   3루 주자는 별도 resolveStealResult 호출 (홈 쇄도 판정)
//
// 1+2루: 3루 송구 (선행 주자 = 2루 주자)
//   throwBase: 3, targetRunner: runners.second
//   1루 주자 → 2루 세이프 (포수가 3루 송구 선택)
//
// 1루만: 2루 송구
// 2루만: 3루 송구
```

---

## `engine/pickoff.ts` (신규 — stub 교체)

```typescript
export interface PickoffDecision {
  attempt: boolean
  base:    1 | 2 | null
  runner:  Player | null
}

export function decidePickoff(
  pitcher: Player,
  runners: Runners,
): PickoffDecision

// 견제 가능 상황:
//   1루만    → base: 1, runner: runners.first
//   2루만    → base: 2, runner: runners.second
//   1+2루    → base: 2, runner: runners.second  (선행 주자)
//   1+3루    → base: 1, runner: runners.first
//   3루만/2+3루/만루 → attempt: false
//
// 견제 확률 = 2 + sqrt(runner.stats.running) * (0.18**3)  (%)
// Math.random() * 100 < 견제확률 → attempt: true

export function resolvePickoff(
  pitcher: Player,
  runner:  Player,
): 'out' | 'safe'

// OUT 확률:
//   pitcherFactor = (pitcher.stats.ball_control * 1e-7) ** 0.52
//   runnerFactor  = (runner.stats.running * 0.00013) ** 2
//   outProb = Math.max(0, pitcherFactor - runnerFactor)
//   Math.random() < outProb → 'out'
```

---

## `game/at-bat.ts` 변경

### 추가 import
```typescript
import { findCatcher }       from './util'          // 불필요 — half-inning에서 전달
import { decidePickoff, resolvePickoff } from '../engine/pickoff'
import { decideStealAttempt, resolveStealResult, decideCatcherThrow } from './stolen-base'
```

### 루프 흐름 변경
```typescript
export function runAtBat(pitcher, batter, ctx): AtBatOutcome {
  let currentRunners = { ...ctx.runners }   // ← mutable 주자 상태
  let pickoutCount   = 0                    // ← 타석 내 견제 시도 횟수

  while (true) {
    // ① 투구 전: 견제 체크
    const pickoff = decidePickoff(pitcher, currentRunners)
    if (pickoff.attempt && pickoff.runner && pickoff.base) {
      events.push({ type: 'pickoff_attempt', ... })
      const result = resolvePickoff(pitcher, pickoff.runner)
      events.push({ type: 'pickoff_result', ... })

      if (result === 'out') {
        // 해당 루 주자 제거
        if (pickoff.base === 1) currentRunners = { ...currentRunners, first: null }
        else                    currentRunners = { ...currentRunners, second: null }
        // early return: pickoff_out
        return {
          result: 'pickoff_out',
          outs_added: 1,
          runs_scored: 0,
          next_runners: currentRunners,
          moves: [{ runner: pickoff.runner, from: pickoff.base, to: pickoff.base }],
          ...
        }
      } else {
        pickoutCount++   // 실패: 패널티 카운트 증가
      }
    }

    // ② throwPitch
    const pitch = throwPitch(...)

    // ③ 투구 후: 도루 시도 체크 (주자 있을 때만)
    const stealRunner = currentRunners.second ?? currentRunners.first
    const stealBase   = currentRunners.second ? 2 : currentRunners.first ? 1 : null

    if (stealRunner && stealBase) {
      const attempt = decideStealAttempt(stealRunner, stealBase, pitcher, ctx.catcher, pickoutCount)
      if (attempt) {
        events.push({ type: 'steal_attempt', ... })

        // ④ hitBall (헛스윙 여부 필요)
        const batting = hitBall(...)
        const isSwingAndMiss = batting.swing && !batting.contact

        // ⑤ 포수 송구 결정
        const throwDecision = decideCatcherThrow(currentRunners, ctx.catcher, pitcher, pitch)

        if (throwDecision.throwBase !== null && throwDecision.targetRunner) {
          const to = stealBase === 1 ? 2 : 3
          const stealResult = resolveStealResult(
            stealRunner, to, pitch, ctx.catcher, isSwingAndMiss, pickoutCount
          )
          events.push({ type: 'steal_result', ... })

          if (stealResult === 'caught') {
            // 주자 소멸 처리
            currentRunners = removeRunner(currentRunners, stealBase)
            return { result: 'caught_stealing', outs_added: 1, ... }
          } else {
            // 주자 진루 처리
            currentRunners = advanceRunner(currentRunners, stealBase)

            // 1+3루 홈 쇄도 체크
            if (currentRunners.third && throwDecision.throwBase === 2) {
              const homeResult = resolveStealResult(
                currentRunners.third, 'home', pitch, ctx.catcher, isSwingAndMiss, pickoutCount
              )
              if (homeResult === 'success') {
                // 3루 주자 득점
              } else {
                // 3루 주자 아웃
              }
            }
          }
        }
        // hitBall 결과 처리 (count 업데이트 등)
        count = batting.next_count
        // ... pitch 이벤트 push, at_bat_over 체크
        continue  // 다음 투구로
      }
    }

    // ⑥ 일반 hitBall (도루 없는 경우)
    const batting = hitBall(...)
    count = batting.next_count
    // ... 기존 로직
    if (batting.at_bat_over) {
      const { nextRunners, runsScored, moves } = advanceRunners(
        batting.at_bat_result,
        currentRunners,   // ← ctx.runners 대신 currentRunners 사용
        batter,
      )
      return { ..., next_runners: nextRunners, ... }
    }
  }
}
```

---

## `game/half-inning.ts` 변경

```typescript
import { findCatcher } from './util'

export function runHalfInning(lineup, pitcher, batterIdx, inning, isTop, init) {
  const catcher = findCatcher(lineup)   // ← 포수 탐색

  // runAtBat 호출 시 catcher 추가
  const outcome = runAtBat(currentPitcher, batter, {
    ...,
    catcher,   // ← 신규
  })
  ...
}
```

---

## PitchResult ball_speed 확인

`engine/types.ts`의 `PitchResult`에 `ball_speed` 필드가 있는지 확인 필요.
없으면 `delivery_time`(투구 시간)을 역산하거나 `pitch_type`의 `ball_speed`를 사용.

---

## 실행 계획

**Phase 1 — 타입**
- [ ] `batting/types.ts`: `pickoff_out`, `caught_stealing` 추가
- [ ] `game/types.ts`: `GameEventType` 확장, `AtBatContext.catcher` 추가

**Phase 2 — 유틸/신규 모듈**
- [ ] `game/util.ts`: `findCatcher`
- [ ] `engine/pickoff.ts`: 견제 로직 (stub 교체)
- [ ] `game/stolen-base.ts`: 도루 시도/성공, 포수 송구 결정

**Phase 3 — at-bat/half-inning 수정**
- [ ] `game/at-bat.ts`: currentRunners mutable, 견제/도루 루프
- [ ] `game/half-inning.ts`: catcher 탐색 및 전달

**Phase 4 — 검증**
- [ ] `engine/pickoff-stub.ts` 삭제 (pickoff.ts가 대체)
- [ ] `scripts/simulate-game.mjs`: 포수 포지션 추가, steal/pickoff 이벤트 카운트 출력
- [ ] `npx tsc --noEmit`

---

## Risk & Rollback

| 리스크 | 대응 |
|--------|------|
| `PitchResult`에 `ball_speed` 없을 수 있음 | Phase 2 시작 전 `engine/types.ts` 확인 |
| `currentRunners` 변경이 `advanceRunners` 결과와 중복될 수 있음 | 도루 성공 주자는 `advanceRunners` 내에서 이미 이동된 루에 있으므로 중복 방지 로직 필요 |
| 1+3루 홈 쇄도 판정이 복잡 | MVP에서는 포수가 항상 2루 송구 선택 시 3루 주자 홈 쇄도 단순 판정으로 구현 |
| 포수 없는 lineup | `findCatcher` fallback(`lineup[1]`)으로 처리 |
