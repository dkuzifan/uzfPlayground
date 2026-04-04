---
title: "Tech Spec — 수비 엔진 #6 실책 (Error)"
date: 2026-04-03
owner: @dkuzifan
status: draft
---

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/baseball/game/config.ts` | `ERROR_COEFF`, `THROW_ERROR_COEFF` 상수 추가 |
| `src/lib/baseball/batting/types.ts` | `AtBatResult`에 `'reach_on_error'` 추가 |
| `src/lib/baseball/batting/hit-result.ts` | 3분법(out/error/hit) 분기 추가 |
| `src/lib/baseball/defence/types.ts` | `HitResultDetail.is_error` 추가 |
| `src/lib/baseball/defence/throw-judge.ts` | `resolveThrow`, `resolveRelayThrow` 반환 타입 확장 |
| `src/lib/baseball/defence/runner-decision.ts` | `resolveSecondaryThrow` 반환 타입 확장 |
| `src/lib/baseball/game/types.ts` | `'fielding_error'`, `'throwing_error'` GameEventType 추가 |
| `src/lib/baseball/game/stats-types.ts` | `FielderGameStats`, `PitcherGameStats.R`, `GameStats` 확장 |
| `src/lib/baseball/game/runner-advance.ts` | wild_throw 처리 + throwing_error 이벤트 emit |
| `src/lib/baseball/game/at-bat.ts` | reach_on_error 시 fielding_error 이벤트 emit |
| `src/lib/baseball/game/calc-game-stats.ts` | error_runners 추적, E/R 스탯 처리 |
| `src/lib/baseball/game/pbp-text.ts` | `reach_on_error` 텍스트 추가 |

---

## 1. 상수 추가 — `config.ts`

```typescript
export const ERROR_COEFF       = 0.04   // 포구 실책: p_error = p_out * ERROR_COEFF
export const THROW_ERROR_COEFF = 0.03   // 송구 실책 기본 계수
```

---

## 2. `AtBatResult` 확장 — `batting/types.ts`

```typescript
| 'reach_on_error'  // 실책 출루 (타수 기록, 안타 아님)
```

---

## 3. 포구 실책 3분법 — `batting/hit-result.ts`

기존 이분법을 삼분법으로 교체:

```typescript
const p_error = p_out * ERROR_COEFF

const roll = Math.random()
if (roll < p_out) {
  // 포구 성공 → 아웃
  const catch_setup_time = p_out >= 0.5 ? 0.2 : 0.4
  return { result: 'out', fielder, fielder_pos, t_fielding, t_ball_travel, is_infield, catch_setup_time }
}
if (roll < p_out + p_error) {
  // 잡을 수 있었지만 실수 → 실책 출루
  return { result: 'reach_on_error', fielder, fielder_pos, t_fielding, t_ball_travel, is_infield, is_error: true }
}
// 수비 범위 밖 → 안타
const result = resolveHitType(physics.range)
return { result, fielder, fielder_pos, t_fielding, t_ball_travel, is_infield }
```

---

## 4. `HitResultDetail.is_error` — `defence/types.ts`

```typescript
is_error?: boolean   // true = 포구 실책 (reach_on_error)
```

---

## 5. `resolveThrow` / `resolveRelayThrow` 확장 — `defence/throw-judge.ts`

### 반환 타입

```typescript
'safe' | 'out' | 'wild_throw'
```

### `resolveThrow` 변경

```typescript
// 기존 safe/out 판정 후:
const verdict = Math.random() < p_safe ? 'safe' : 'out'
if (verdict === 'out') {
  // 아웃 직전에만 폭투 가능 (주자가 이미 safe면 추가 실책 불필요)
  const p_throw_error = THROW_ERROR_COEFF
    * (1 - thrower.stats.throw / 100)
    * Math.max(0.3, Math.min(1.0, throw_dist / 60))
  if (Math.random() < p_throw_error) return 'wild_throw'
}
return verdict
```

`THROW_ERROR_COEFF`는 `config.ts`에서 import.

### `resolveRelayThrow` 변경

동일 패턴: 중계 경로 `'out'` 판정 후 `wild_throw` 체크 추가.
반환 타입: `'safe' | 'out' | 'wild_throw'`

---

## 6. `resolveSecondaryThrow` 확장 — `defence/runner-decision.ts`

반환 타입: `'safe' | 'out' | 'wild_throw'`
내부에서 `resolveThrow` 반환값을 그대로 전달 (별도 로직 없음).

---

## 7. `GameEventType` 추가 — `game/types.ts`

```typescript
| 'fielding_error'   // { fielder: Player; batter: Player }
| 'throwing_error'   // { thrower: Player; runner: Player; to: BaseKey; extra_base: BaseKey }
```

---

## 8. 스탯 타입 확장 — `game/stats-types.ts`

### `FielderGameStats` 신규

```typescript
export interface FielderGameStats {
  player: Player
  E: number   // 실책 수
}
```

### `PitcherGameStats.R` 추가

```typescript
R:  number   // 총 실점 (자책 + 비자책)
// ER: 기존 유지 (자책점만)
// 주석 "수비 에러 미구현..." 제거
```

### `TeamGameStats` 확장

```typescript
export interface TeamGameStats {
  batters:  BatterGameStats[]
  pitchers: PitcherGameStats[]
  fielders: FielderGameStats[]   // 추가
}
```

---

## 9. `wild_throw` 처리 — `game/runner-advance.ts`

### 처리 원칙

`wild_throw`는 `'safe'`처럼 주자가 목표 베이스에 안착 + 추가 진루 1 베이스.
추가 진루는 무혈 (`getNextBase`로 한 칸 더).

### 각 호출 지점 처리

**① `throwVerdictForTarget` (단타/2루타 주자)** — line 555 근처

```typescript
const verdict = useRelay
  ? resolveRelayThrow(...)
  : resolveThrow(fielder, throw_dist, hp.t_fielding, runner, runner_dist)

if (verdict === 'wild_throw') {
  // 목표 베이스에 안착 + extra 1베이스
  const extraBase = getNextBase(targetBase)
  events.push({
    type: 'throwing_error', ...
    payload: { thrower: fielder, runner, to: targetBase, extra_base: extraBase ?? targetBase },
  })
  // nextRunners에 extraBase 반영 (null이면 홈 득점)
  return 'wild_throw_safe'  // 내부 처리용 — safe로 취급
}
```

**② `resolveOutfieldFlyOut` (태그업)** — line 353 근처

`wild_throw` → safe 처리 + 다음 베이스로 추가 진루 + `throwing_error` 이벤트

**③ `resolveBatterAdvance` (타자 2루 시도)** — line 701

```typescript
const verdict = resolveThrow(...)
// wild_throw는 safe와 동일 처리 (타자 2루까지만, 추가 진루 없음)
return (verdict === 'safe' || verdict === 'wild_throw') ? 2 : 1
```

타자의 폭투 추가 진루는 없음 — 타자는 1루→2루로 제한.

**④ `secondaryVerdict` (2차 송구)** — line 632

`wild_throw` → safe + extra 1 베이스 + `throwing_error` 이벤트

---

## 10. `fielding_error` 이벤트 emit — `at-bat.ts`

`at_bat_result === 'reach_on_error'` 시 이벤트 추가:

```typescript
if (batting.at_bat_result === 'reach_on_error' && batting.hit_physics) {
  events.push({
    type:    'fielding_error',
    inning,
    isTop,
    payload: { fielder: batting.hit_physics.fielder, batter },
  })
}
```

`at_bat_result` 이벤트 바로 다음에 emit.

---

## 11. `calc-game-stats.ts` — 에러 처리

### `makeFielderStats` / `getFielder` 헬퍼 추가

```typescript
function makeFielderStats(player: Player): FielderGameStats {
  return { player, E: 0 }
}
```

### `error_runners` Set (이닝 단위)

```typescript
let error_runners = new Set<string>()  // 실책 출루 주자 id
```

### 이벤트 처리 추가

```typescript
case 'fielding_error': {
  const fielder = event.payload.fielder as Player
  const batter  = event.payload.batter  as Player
  getFielder(defState, fielder).E++
  error_runners.add(batter.id)
  break
}

case 'throwing_error': {
  const thrower    = event.payload.thrower as Player
  const runner     = event.payload.runner  as Player
  getFielder(defState, thrower).E++
  error_runners.add(runner.id)
  break
}

case 'at_bat_result': {
  // 기존 처리 + reach_on_error 추가
  case 'reach_on_error':
    b.AB++
    // 안타 기록 없음, 출루 처리는 advanceRunners가 담당
    pendingBatter = null  // 실책 출루는 RBI 없음
    break
}

case 'score': {
  const runs = event.payload.runs_scored as number
  const p    = getCurrentPitcher(defState)
  p.R  += runs   // 총 실점은 항상 증가
  // ER: error_runners에 있는 주자가 득점한 경우 제외
  // ※ score 이벤트에는 scorer 정보가 없음 — runner_advance와 연계 필요
  // → runner_advance에서 각 'home' 도달 주자를 체크
  break
}

case 'runner_advance': {
  const moves = event.payload.moves as Array<{ runner: Player; to: unknown }>
  let earned_runs = 0
  let unearned_runs = 0
  for (const m of moves) {
    if (m.to === 'home') {
      if (error_runners.has((m.runner as Player).id)) {
        unearned_runs++
      } else {
        earned_runs++
      }
    }
  }
  if (earned_runs > 0 && pendingBatter) {
    // RBI: earned runs만
    const b = pendingBatter.state.batters.get(pendingBatter.id)
    if (b) b.RBI += earned_runs
  }
  getCurrentPitcher(defState).ER += earned_runs
  // R은 score 이벤트에서 처리
  pendingBatter = null
  break
}

case 'inning_end': {
  error_runners = new Set()  // 이닝 종료 시 초기화
  break
}
```

### `score` 이벤트에서 `R` 처리

```typescript
case 'score': {
  const runs = event.payload.runs_scored as number
  getCurrentPitcher(defState).R += runs
  // ER은 runner_advance 이벤트에서 처리 (error_runners 체크)
  offState.score += runs
  break
}
```

---

## 12. `pbp-text.ts`

```typescript
reach_on_error: { title: '실책', sub: '실책 출루' }
```

---

## 데이터 흐름 요약

```
resolveHitResult
  └─ roll 범위 분기
      ├─ < p_out            → out
      ├─ < p_out + p_error  → reach_on_error (is_error=true)
      └─ else               → single/double/triple

at-bat.ts
  └─ at_bat_result=reach_on_error
      → fielding_error 이벤트 emit { fielder, batter }

advanceRunners (reach_on_error)
  └─ fixedAdvance('single') 경로 (실책 출루 = 타자 1루)
     (or resolveRunnerAdvances — 기존 주자 진루 판단)

resolveThrow / resolveRelayThrow
  └─ verdict='out' 후 p_throw_error 체크
      → 'wild_throw' 반환

runner-advance.ts (wild_throw 처리)
  └─ 주자 목표 베이스 안착 + extra 1베이스
      → throwing_error 이벤트 emit { thrower, runner, to, extra_base }

calc-game-stats.ts
  ├─ fielding_error → fielder.E++, error_runners.add(batter.id)
  ├─ throwing_error → thrower.E++, error_runners.add(runner.id)
  ├─ runner_advance → earned/unearned 분리, ER 증가
  ├─ score          → R 증가 (총 실점)
  └─ inning_end     → error_runners.clear()
```

---

## 셀프 리뷰

**Denis (프론트엔드)**: `runner_advance` 이벤트에서 earned/unearned를 분리하는 로직이 `score` 이벤트와 중복될 수 있습니다. 현재 설계에서 `score` 이벤트는 `R` 증가에만 쓰고, `runner_advance`에서 `ER` 처리를 하는 책임 분리가 명확해야 `calc-game-stats.ts`의 통계가 일관됩니다.
→ 쉽게 말하면: 총 실점은 `score` 이벤트가, 자책점 구분은 `runner_advance` 이벤트가 담당하도록 역할을 나눠야 나중에 헷갈리지 않습니다.

**Bitsaion (백엔드)**: `reach_on_error` 타자의 advanceRunners 처리가 명시되지 않았습니다. 현재 `fixedAdvance('single')` 경로를 쓰면 1루 배치가 되지만, `advanceRunners`에서 `reach_on_error` 분기가 명시적으로 있어야 합니다. 기존 주자 진루 판단(`resolveRunnerAdvances`)도 실행해야 합니다.
→ 쉽게 말하면: 실책으로 타자가 1루 나가는 것만 처리하면 되고, 기존 주자들 이동은 단타와 동일하게 처리하면 됩니다. 이 흐름이 코드에서 명확해야 합니다.

**Zhihuan (테크 리드)**: `error_runners` Set이 이닝 단위로 초기화되는 것이 맞지만, 타석 단위가 아닌 이닝 단위인 이유를 명시해야 합니다 — 실책 출루한 주자는 여러 타석을 거쳐 득점할 수 있으므로, 이닝이 끝날 때까지 추적이 필요합니다.
→ 쉽게 말하면: 실책으로 나간 주자가 3타석 뒤에 홈에 들어와도 비자책점이어야 하므로, 이닝이 끝날 때까지 "실책 주자 목록"을 유지해야 합니다.

**반영 사항:**
- Bitsaion 지적 → Tech Spec에 `reach_on_error`의 `advanceRunners` 처리 명시 (아래)

### `reach_on_error` → `advanceRunners` 처리

`advanceRunners`에서 `reach_on_error`는 `single`과 동일 경로 처리:
```typescript
// runner-advance.ts advanceRunners 분기 추가
if (result === 'reach_on_error') {
  // 기존 주자 진루: single과 동일 (resolveRunnerAdvances)
  // 타자: 1루 배치
  // → result를 'single'로 내려보내거나, 별도 분기로 동일 로직 호출
}
```
구현 시 `result === 'single' || result === 'reach_on_error'` 조건으로 통합.
