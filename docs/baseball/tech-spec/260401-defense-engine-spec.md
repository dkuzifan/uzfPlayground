---
title: 수비 엔진 #1 — 포구 판정 Tech Spec
date: 2026-04-01
feature: defense-engine-catch
prd: docs/baseball/prd/260401-defense-engine.md
status: draft
---

## 1. Overview

`resolveHitResult(ev, la)` 의 내부를 EV×LA 확률 테이블에서
**타구 물리 + 수비수 위치 + Defence 스탯 기반 포구 판정**으로 교체한다.

호출부 시그니처 변경: `(ev, la)` → `(ev, la, batter, fielders)`
반환 타입은 그대로 유지 (`AtBatResult` 서브셋).

---

## 2. 수정/생성 파일 목록

### 신규 생성
| 파일 | 역할 |
|------|------|
| `src/lib/baseball/defence/types.ts` | FieldCoords, BallPhysicsResult, BallType |
| `src/lib/baseball/defence/fielder-positions.ts` | FIELDER_DEFAULT_POS 상수 테이블 |
| `src/lib/baseball/defence/ball-physics.ts` | 타구 물리 (drag + Magnus + 방향각) |
| `src/lib/baseball/defence/catch-probability.ts` | 포구 확률 계산, 수비수 선택 |

### 수정
| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/baseball/types/player.ts` | `Player`에 `defence_pos?: { x: number; y: number }` 추가 |
| `src/lib/baseball/data/stadiums.ts` | `Stadium`에 `fence_distance?: number` 추가, STADIUMS에 기본값 주입 |
| `src/lib/baseball/batting/hit-result.ts` | `resolveHitResult` 시그니처 확장 + 구현체 교체 |
| `src/lib/baseball/batting/hit-ball.ts` | `hitBall` 3번째 파라미터 `defenceLineup?: Player[]` 추가 |
| `src/lib/baseball/game/at-bat.ts` | `runAtBat` 4번째 파라미터 `defenceLineup?: Player[]` 추가 |
| `src/lib/baseball/game/half-inning.ts` | `runHalfInning` 마지막 파라미터 `defenceLineup?: Player[]` 추가 |
| `src/lib/baseball/game/game-loop.ts` | TOP/BOT 반이닝에 각각 상대 라인업 전달 |

---

## 3. 타입 정의 (`defence/types.ts`)

```typescript
export interface FieldCoords {
  field_x: number   // m, 홈 기준 좌우 (1루 방향 +)
  field_y: number   // m, 홈→중견수 방향 +
}

export interface BallPhysicsResult {
  range:    number        // Magnus 보정 착지 거리 (m)
  v_roll_0: number        // 첫 바운드 직후 수평 속도 (m/s)
  t_bounce: number        // 첫 바운드 시간 (s)
  landing:  FieldCoords   // 착지 필드 좌표
}

// LA 기준 타구 분류 (포구 확률 로직 분기용)
export type BallType = 'popup' | 'fly' | 'line_drive' | 'grounder'
```

---

## 4. 수비수 포지션 테이블 (`defence/fielder-positions.ts`)

```typescript
import type { Position } from '../types/player'

export const FIELDER_DEFAULT_POS: Partial<Record<Position, { x: number; y: number }>> = {
  P:   { x:   0, y:  17 },
  C:   { x:   0, y:  -1 },
  '1B':{ x:  11, y:  24 },
  '2B':{ x:  10, y:  33 },
  SS:  { x:  -8, y:  33 },
  '3B':{ x: -11, y:  24 },
  LF:  { x: -35, y:  80 },
  CF:  { x:   0, y: 100 },
  RF:  { x:  35, y:  80 },
}
```

---

## 5. 타구 물리 (`defence/ball-physics.ts`)

### 5-1. `classifyBallType(la_deg): BallType`

```
la ≤ 10° → 'grounder'
la ≤ 25° → 'line_drive'
la ≤ 45° → 'fly'
la > 45° → 'popup'
```

### 5-2. `calcBattedBallPhysics(ev_kmh, la_deg): BallPhysicsResult`

**Phase A — 포물선 (drag 방정식)**

```
v0   = ev_kmh / 3.6          // m/s로 변환
θ    = la_deg × π/180
g    = 9.8

// D 구간 보정
D = ev_kmh ≤ 120 ? 0.18 : ev_kmh ≤ 150 ? 0.22 : 0.27

// drag 방정식
x(t) = (v0·cosθ / D) × (1 − e^(−Dt))
y(t) = (−g·t / D) + ((D·v0·sinθ + g) / D²) × (1 − e^(−Dt))

// y(t)=0 이진 탐색 → t_bounce (허용 오차 0.001s, 최대 50회)
// range_raw = x(t_bounce)
// v_x_bounce = v0·cosθ · e^(−D·t_bounce)  (drag 감속 후 수평 속도)
```

**Magnus 보정**

```
contact_quality = clamp((ev_kmh − 120) / 50, 0, 1)
carry_factor    = 1.0 + contact_quality × 0.12
range           = range_raw × carry_factor
```

**Phase B — 첫 바운드 속도**

```
restitution = 0.5
v_roll_0    = v_x_bounce × restitution
```

**출력**: `{ range, v_roll_0, t_bounce, landing: toFieldCoords(range, θ_h) }`

> `θ_h`는 `calcBattedBallPhysics` 호출 전 `selectDirectionAngle`로 결정하고,
> 착지 좌표 계산 시 인자로 전달한다.

### 5-3. `selectDirectionAngle(batter: Player): number`

```
μ = batter.bats === 'L' ? +5 : −5   // 당기기 편향 (S는 −5 기본)
θ = μ + gaussianNoise(σ=25)
θ = clamp(θ, −42, +42)
return θ
```

### 5-4. `toFieldCoords(range, theta_deg): FieldCoords`

```
θ = theta_deg × π/180
field_x = range × sin(θ)
field_y = range × cos(θ)
```

---

## 6. 포구 확률 (`defence/catch-probability.ts`)

### 6-1. `findResponsibleFielder(coords: FieldCoords, fielders: Player[]): Player`

```typescript
// 각 수비수 위치: player.defence_pos ?? FIELDER_DEFAULT_POS[player.position_1]
// 없으면 console.warn + Defence 70 더미 반환
// 유클리드 거리 최소 수비수 반환
```

### 6-2. `calcCatchProbability(ballType, d, v_roll_0, fielder): number`

| ballType | 공식 |
|----------|------|
| `popup` | `1.0` |
| `fly` / `line_drive` | `coverage_radius = 6 + (defence/100)×6`<br>`P_out = clamp(0.95 − 0.05 × max(d − coverage_radius, 0), 0.05, 0.95)` |
| `grounder` | `fielder_speed = 3.5 + (defence/100)×1.5`<br>`t_ball = −ln(1 − d×0.4/v_roll_0) / 0.4` *(v_roll_0×d/0.4 ≥ 1 → P_out=1.0)*<br>`t_fielder = 0.4 + d / fielder_speed`<br>`P_out = clamp(0.3 + (t_ball − t_fielder)×0.15, 0.05, 0.90)` |

---

## 7. `resolveHitResult` 교체 (`batting/hit-result.ts`)

### 새 시그니처

```typescript
export function resolveHitResult(
  exit_velocity: number,
  launch_angle:  number,
  batter:        Player,
  fielders:      Player[],
): Exclude<AtBatResult, 'in_progress' | 'strikeout' | 'walk' | 'hit_by_pitch'>
```

### 내부 로직 (순서)

```
1. θ_h = selectDirectionAngle(batter)
2. physics = calcBattedBallPhysics(exit_velocity, launch_angle, θ_h)
3. if physics.range >= FENCE_DISTANCE → return 'home_run'
4. ballType = classifyBallType(launch_angle)
5. fielder = findResponsibleFielder(physics.landing, fielders)
6. d = euclideanDist(physics.landing, fielderPos)
7. P_out = calcCatchProbability(ballType, d, physics.v_roll_0, fielder)
8. if Math.random() < P_out → return 'out'
9. return resolveHitType(physics.range)   // 거리 기반 1B/2B/3B 분기
```

### 상수

```typescript
const FENCE_DISTANCE = 120   // m (구장별 override 가능 — 추후 N1)
```

---

## 8. 호출 체인 수정 상세

### `hit-ball.ts`

```typescript
// 변경 전
export function hitBall(state: BattingState, pitch: PitchResult): BattingResult

// 변경 후
export function hitBall(
  state: BattingState,
  pitch: PitchResult,
  defenceLineup?: Player[],
): BattingResult
```

line 91:
```typescript
// 변경 전
const hit_type = resolveHitResult(exit_velocity, launch_angle)

// 변경 후
const hit_type = resolveHitResult(exit_velocity, launch_angle, batter, defenceLineup ?? [])
```

### `at-bat.ts`

```typescript
// 변경 전
export function runAtBat(pitcher, batter, ctx): AtBatOutcome

// 변경 후
export function runAtBat(pitcher, batter, ctx, defenceLineup?: Player[]): AtBatOutcome
```

두 곳의 `hitBall(battingState, pitch)` 호출에 `defenceLineup` 추가:
```typescript
hitBall(battingState, pitch, defenceLineup)
```

### `half-inning.ts`

```typescript
// 변경 전
export function runHalfInning(lineup, pitcher, batterIdx, inning, isTop, init): HalfInningResult

// 변경 후
export function runHalfInning(lineup, pitcher, batterIdx, inning, isTop, init, defenceLineup?: Player[]): HalfInningResult
```

`runAtBat` 호출에 `defenceLineup` 전달:
```typescript
const outcome = runAtBat(currentPitcher, batter, { ...ctx }, defenceLineup)
```

### `game-loop.ts`

```typescript
// TOP (원정 공격, 홈 수비) → defenceLineup = homeTeam.lineup
runHalfInning(awayTeam.lineup, homePitcher, ..., homeTeam.lineup)

// BOT (홈 공격, 원정 수비) → defenceLineup = awayTeam.lineup
runHalfInning(homeTeam.lineup, awayPitcher, ..., awayTeam.lineup)
```

---

## 9. Player 타입 변경 (`types/player.ts`)

```typescript
export interface Player {
  // ... 기존 필드 유지
  defence_pos?: { x: number; y: number }   // 미설정 시 FIELDER_DEFAULT_POS 폴백
}
```

---

## 10. Stadium 타입 변경 (`data/stadiums.ts`)

```typescript
export interface Stadium {
  id:               string
  name:             string
  location:         string
  fence_distance?:  number   // 미설정 시 120m 기본값 사용
}
```

---

## 11. 데이터 흐름

```
runGame(homeTeam, awayTeam)
  │
  ├─ TOP: runHalfInning(awayLineup, ..., defenceLineup=homeLineup)
  │         └─ runAtBat(..., defenceLineup)
  │               └─ hitBall(state, pitch, defenceLineup)
  │                     └─ resolveHitResult(ev, la, batter, defenceLineup)
  │                           ├─ selectDirectionAngle(batter) → θ_h
  │                           ├─ calcBattedBallPhysics(ev, la, θ_h) → physics
  │                           ├─ isHomeRun(physics.range) → 'home_run'?
  │                           ├─ findResponsibleFielder(physics.landing, defenceLineup) → fielder
  │                           ├─ calcCatchProbability(ballType, d, v_roll_0, fielder) → P_out
  │                           └─ resolveHitType(physics.range) → '1B'|'2B'|'3B'
  │
  └─ BOT: runHalfInning(homeLineup, ..., defenceLineup=awayLineup)
            └─ [동일]
```

---

## 12. Plan

### Phase A — 타입 확장 (선행 필수)
- [ ] `types/player.ts` — `defence_pos?` 필드 추가
- [ ] `data/stadiums.ts` — `fence_distance?` 필드 추가

### Phase B — 타구 물리 + 유틸 함수
- [ ] `defence/types.ts` 생성
- [ ] `defence/fielder-positions.ts` 생성
- [ ] `defence/ball-physics.ts` 생성 (`classifyBallType`, `calcBattedBallPhysics`, `selectDirectionAngle`, `toFieldCoords`)
- [ ] `defence/catch-probability.ts` 생성 (`findResponsibleFielder`, `calcCatchProbability`)

### Phase C — resolveHitResult 교체
- [ ] `batting/hit-result.ts` — 시그니처 확장 + 신규 로직으로 교체
- [ ] `batting/hit-ball.ts` — `defenceLineup` 파라미터 추가 **(도루 분기 145번 줄, 일반 분기 283번 줄 두 곳 수정)**

### Phase D — 호출 체인 수정
- [ ] `game/at-bat.ts` — `defenceLineup` 파라미터 추가, hitBall 호출 2곳 수정
- [ ] `game/half-inning.ts` — `defenceLineup` 파라미터 추가, runAtBat 호출 수정
- [ ] `game/game-loop.ts` — TOP/BOT에 상대 라인업 전달

### Phase E — 검증
- [ ] `runGame()` 빌드 통과
- [ ] 동일 팀 100회 시뮬레이션 → Defence 80 vs Defence 50 BABIP 비교
- [ ] HR/FB%, BABIP 범위 확인 (BABIP .280~.310)

---

## 13. Risk & Rollback

| 리스크 | 대응 |
|--------|------|
| `defenceLineup` 빈 배열(`[]`) 전달 시 `findResponsibleFielder`가 `undefined` 반환 | 빈 배열 방어 로직 + console.warn + Defence 70 더미 반환 |
| 이진 탐색이 수렴 실패 (수직 낙구 등 edge case) | 50회 반복 후 t=0 반환, `range=0` → `out` 처리 |
| 내야 땅볼 `d×μ ≥ v_roll_0` (공이 멈춤) | 조건 체크 후 `P_out = 1.0` 반환 |
| `position_1`이 `DH` / `UTIL` — FIELDER_DEFAULT_POS 미정의 | console.warn + Defence 70 더미 반환 |
| 롤백 | 파라미터 전부 optional(`?`)이므로 호출부 수정 없이 기존 테이블 로직 fallback 가능 |
