---
title: "Tech Spec — 수비 엔진 #2 송구 판정"
date: 2026-04-01
owner: @dkuzifan
status: draft
prd: docs/baseball/prd/260401-defense-engine-2-throw.md
---

## 1. 파일 목록

### 신규 생성

| 파일 | 역할 |
|------|------|
| `src/lib/baseball/defence/throw-judge.ts` | BASE_POS 상수, resolveThrow(), calcOverrunDist(), calcRemainingToBase() |

### 수정

| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/baseball/defence/types.ts` | `HitResultDetail` 인터페이스 추가 |
| `src/lib/baseball/batting/hit-result.ts` | `resolveHitResult` 반환 타입 → `HitResultDetail` |
| `src/lib/baseball/batting/types.ts` | `BattingResult`에 `hit_physics?: HitResultDetail` 추가 |
| `src/lib/baseball/batting/hit-ball.ts` | `resolveHitResult` 새 반환값 처리 |
| `src/lib/baseball/game/runner-advance.ts` | `advanceRunners` optional 파라미터 확장 |
| `src/lib/baseball/game/at-bat.ts` | `advanceRunners` 호출부 2곳에 hit_physics + stealState 전달 |

---

## 2. 인터페이스 설계

### `defence/types.ts` 추가

```typescript
/** resolveHitResult → advanceRunners 로 전달되는 물리 컨텍스트.
 *  HitResultDetail이 hit_physics로 그대로 사용됨 (별도 타입 없음).
 *  t_ball_travel = BallPhysicsResult.t_bounce (공 비행 시간 = 첫 바운드 시간)
 */
export interface HitResultDetail {
  result:        AtBatResult
  fielder:       Player
  fielder_pos:   { x: number; y: number }  // findResponsibleFielder 결과의 pos
  t_fielding:    number        // t_ball_travel + 0.3s (반응 시간)
  t_ball_travel: number        // = BallPhysicsResult.t_bounce
  is_infield:    boolean       // physics.range < 36m
}
```

### `defence/throw-judge.ts` (신규)

```typescript
import type { Player } from '../types/player'

// ── 베이스 좌표 ──────────────────────────────────────────────
export const BASE_POS = {
  home: { x:    0, y:    0 },
  '1B': { x: 19.4, y: 19.4 },
  '2B': { x:    0, y: 38.8 },
  '3B': { x: -19.4, y: 19.4 },
} as const

export type BaseKey = keyof typeof BASE_POS

// ── resolveThrow ─────────────────────────────────────────────
/**
 * 수비수→베이스 송구 판정.
 * thrower: 송구하는 수비수
 * throw_dist: 수비수 위치→목표 베이스 거리 (m)
 * t_fielding: 포구까지 걸린 시간 (s)
 * runner: 진루 시도 주자
 * runner_dist: 주자의 목표 베이스까지 남은 거리 (m)
 */
export function resolveThrow(
  thrower:    Player,
  throw_dist: number,
  t_fielding: number,
  runner:     Player,
  runner_dist: number,
): 'safe' | 'out'

// ── overrun / remaining 계산 ─────────────────────────────────
/**
 * 외야 타구 타자의 overrun 거리.
 * run_intensity = clamp(t_ball_travel / 3.0, 0.7, 1.0)
 * overrun_dist  = run_intensity × runner_speed × 0.3
 */
export function calcOverrunDist(
  t_ball_travel: number,
  runner: Player,
): number

/**
 * t_bounce 시점 타자의 2루까지 남은 거리.
 * batter_run = runner_speed × t_ball_travel
 * overrun_pos = 1B_pos + normalize(1B_pos) × overrun_dist
 * remaining   = dist(overrun_pos, 2B_pos)  — batter_run 위치 보정 포함
 */
export function calcRemainingTo2B(
  t_ball_travel: number,
  batter: Player,
): number
```

---

## 3. 데이터 흐름

```
hitBall(pitch, defenceLineup)
  └─ resolveHitResult(ev, la, batter, fielders)
       └─ returns HitResultDetail {
            result, fielder, fielder_pos,
            t_fielding, t_ball_travel, is_infield
          }
  └─ BattingResult { at_bat_result, hit_physics: HitPhysicsContext }

at-bat.ts
  └─ batting = hitBall(...)
  └─ advanceRunners(
       batting.at_bat_result,
       currentRunners,
       batter,
       batting.hit_physics,      // NEW — optional
       stealState?,              // NEW — optional (도루 중 케이스)
     )
       ├─ [walk / hit_by_pitch]  → 기존 forceAdvance (변경 없음)
       ├─ [out / strikeout]      → 변경 없음
       ├─ [grounder → out path]  → R3: resolveThrow → 1B (is_infield=true)
       ├─ [single, outfield]     → R4: leading runner resolveThrow (실제 송구)
       │                            R5: batter resolveThrow (가상 2B 송구)
       ├─ [double]               → R4: leading runner resolveThrow
       └─ [triple / home_run]    → 기존 고정 룰 (변경 없음)
```

---

## 4. `advanceRunners` 확장 설계

```typescript
export interface StealState {
  runner: Player
  base:   1 | 2          // 도루 출발 베이스
  t_steal_run: number    // 도루 진행 시간 (고정 근사: 1.8s)
}

export function advanceRunners(
  result:     AtBatResult,
  runners:    Runners,
  batter:     Player,
  hitPhysics?: HitPhysicsContext,
  stealState?: StealState,
): AdvanceResult
```

**fallback 규칙**: `hitPhysics` 없으면 기존 고정 룰 동작 (backward compat 완전 유지).

---

## 5. 주자 출발 거리 계산 규칙

| 주자 상태 | remaining_dist 계산 |
|-----------|---------------------|
| 일반 베이스 대기 | `base_to_target - pitch_lead` |
| 도루 진행 중 (stealState 일치) | `base_to_target - (runner_speed × 1.8s)` |
| 타자 (외야 단타, 2루 시도) | `calcRemainingTo2B(t_ball_travel, batter)` |
| 타자 (내야 안타) | `27.43m` (직선, overrun 없음) |

**세컨더리 리드**:
```
static_lead = 1.5 + (running / 100) × 1.5
pitch_lead  = static_lead × 2.0
```

---

## 6. 수비수 throw_dist 계산

```typescript
// advanceRunners 내부
const fielder_pos = hitPhysics.fielder_pos
// euclidean distance from fielder_pos to BASE_POS[targetBase]
const throw_dist = Math.hypot(
  fielder_pos.x - BASE_POS[target].x,
  fielder_pos.y - BASE_POS[target].y,
)
```

`fielder_pos`는 `resolveHitResult` → `findResponsibleFielder` 결과의 `pos`를 그대로 전달.

---

## 7. `resolveHitResult` 반환 타입 변경

`HitResultDetail`은 `defence/types.ts`에 정의 (§2 참조).

```typescript
// 기존
export function resolveHitResult(...): AtBatResult

// 변경
export function resolveHitResult(...): HitResultDetail
// result 필드가 기존 AtBatResult와 동일 — 호출부에서 .result 로 접근
```

`hit-ball.ts` 호출부:
```typescript
// 기존
const hit_type = resolveHitResult(ev, la, batter, defenceLineup ?? [])
return { ..., at_bat_result: hit_type }

// 변경
const hitDetail = resolveHitResult(ev, la, batter, defenceLineup ?? [])
return { ..., at_bat_result: hitDetail.result, hit_physics: hitDetail }
```

---

## 8. at-bat.ts 흐름 수정 및 호출부 변경

### 8-1. 도루 분기 실행 순서 수정 (버그 수정 포함)

**현재 문제**: 도루 시도 중 타격 발생 시, 도루 성공/실패가 먼저 판정되어 caught_stealing이 타격 결과를 덮어쓰는 버그 존재.

**변경 후 흐름**:
```typescript
const batting = hitBall(battingState, pitch, defenceLineup)

if (batting.at_bat_over) {
  // 타격 발생 → 도루 판정 스킵, 도루 중이던 주자 위치를 stealState로 전달
  advanceRunners(result, runners, batter, batting.hit_physics, {
    runner: stealRunner, base: stealBase, t_steal_run: 1.8
  })
} else {
  // 타격 없음 → 기존대로 도루 성공/실패 판정
  resolveSteal(...)
}
```

**효과**: 타격 우선 처리 + 도루 중 주자의 midrun 위치 반영 + caught_stealing 버그 수정이 한 번에 해결됨.

### 8-2. advanceRunners 호출부 (도루 + 일반 분기)

```typescript
// 도루 분기 — 타격 발생 시
advanceRunners(
  batting.at_bat_result,
  currentRunners,
  batter,
  batting.hit_physics,
  { runner: stealRunner, base: stealBase, t_steal_run: 1.8 },
)

// 일반 분기
advanceRunners(
  batting.at_bat_result,
  currentRunners,
  batter,
  batting.hit_physics,
)
```

### 8-3. `advanceRunners` 내부 helper 분리 (구현 가이드)

단일 함수에 모든 판정을 넣지 않고 역할별 helper로 분리:

```typescript
// 내부 helper (export 불필요)
function resolveLeadingRunner(...)   // R4: leading runner 진루 판정
function resolveBatterAdvance(...)   // R5: 타자 추가 진루 독립 판정
function calcRunnerDist(...)         // 주자 출발 거리 계산 (세컨더리 리드 / 도루 midrun)
```

---

## 9. 리스크 & 롤백

| 리스크 | 대응 |
|--------|------|
| `hitPhysics` 없는 경로(strikeout, walk 등)에서 `undefined` 접근 | `hitPhysics` undefined 체크 후 고정 룰 fallback |
| `defenceLineup` 빈 배열 → `findResponsibleFielder` dummy 반환 → throw_dist 부정확 | dummy fielder의 Throw 스탯 70 기본값으로 처리, warn 로그 유지 |
| 도루 중 타격 시 steal 결과 선처리로 runner 위치가 이미 변경됨 | `stealState`로 원래 베이스 정보 전달, remaining_dist 보정 |
| 기존 `runGame` / 테스트 코드 호환성 깨짐 | optional 파라미터로 backward compat 유지 |
