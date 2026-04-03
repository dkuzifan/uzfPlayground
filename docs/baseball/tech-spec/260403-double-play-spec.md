---
title: "Tech Spec — 수비 엔진 #4 병살 (Double Play)"
date: 2026-04-03
prd: docs/baseball/prd/260403-double-play.md
status: draft
---

## 영향 파일

| 파일 | 변경 유형 |
|------|---------|
| `src/lib/baseball/batting/types.ts` | **수정** — `AtBatResult`에 `'double_play' \| 'fielders_choice'` 추가 |
| `src/lib/baseball/game/types.ts` | **수정** — `GameEventType` 확장, `HalfInningInit.fieldersChoiceRule` 추가 |
| `src/lib/baseball/game/config.ts` | **수정** — `GAME_CONFIG.fieldersChoiceRule` 추가 |
| `src/lib/baseball/game/runner-advance.ts` | **수정** — `resolveInfieldOut` 추가, `advanceRunners` 분기 추가 |
| `src/lib/baseball/game/half-inning.ts` | **수정** — `fieldersChoiceRule`을 `advanceRunners`로 전달 |
| `src/lib/baseball/game/pbp-text.ts` | **수정** — `double_play` / `fielders_choice` 텍스트 추가 |

---

## 타입 변경

### `AtBatResult` (`batting/types.ts`)

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
  | 'double_play'       // 추가: 내야 그라운더 병살 (2 outs)
  | 'fielders_choice'   // 추가: 포스아웃 + 타자 1루 세이프
  | 'pickoff_out'
  | 'caught_stealing'
```

---

### `GameEventType` (`game/types.ts`)

```typescript
export type GameEventType =
  | /* 기존 */
  | 'secondary_throw'
  | 'force_out'    // 추가: { runner: Player; from: 1|2|3; to: 2|3|'home' } — 포스아웃 개별 기록
```

기존 `// 향후 추가: 'error' | 'double_play' | 'tag_up'` 주석에서 `'double_play'` 제거
(at_bat_result 이벤트의 result 값으로 표현하는 것으로 충분)

---

### `GAME_CONFIG` (`game/config.ts`)

```typescript
export type FieldersChoiceRule = 'mlb' | 'standard'

export const GAME_CONFIG = {
  max_innings:           9,
  max_innings_hard_cap:  30,
  extra_innings_rule:    'unlimited' as ExtraInningsRule,
  fielders_choice_rule:  'mlb' as FieldersChoiceRule,  // 추가
}
```

- `'mlb'`     : 타자가 1루 세이프면 무조건 `fielders_choice`
- `'standard'`: 선행 주자 잡으려 했으나 그 주자까지 세이프인 경우만 `fielders_choice`

---

## 핵심 로직 — `resolveInfieldOut`

### 위치: `game/runner-advance.ts`

### 호출 조건

```typescript
// advanceRunners() 내부 분기
if (result === 'out' && hitPhysics?.is_infield) {
  return resolveInfieldOut(
    runners, batter, hitPhysics, outs,
    defenceLineup, scoreContext, inningCtx,
    GAME_CONFIG.fielders_choice_rule,
  )
}
```

---

### Step 1 — 포스 베이스 결정

```typescript
function detectPivotBase(runners: Runners): {
  forceRunners: Array<{ runner: Player; from: 1|2|3; to: 2|3|'home' }>
  pivotBase: 2 | 3 | 'home'
} | null
```

포스 발생 조건: `runners.first !== null` (타자가 1루를 차지하므로 1루 주자는 반드시 2루로)

| 주자 상황 | 포스 주자 목록 | pivotBase |
|----------|-------------|----------|
| 1루만     | 1루→2루      | 2루      |
| 1·2루    | 1루→2루, 2루→3루 | 2루 (2루→1루가 DP 경로 최적) |
| 만루      | 1루→2루, 2루→3루, 3루→홈 | 2루 (동일) |

> **pivotBase 선택 원칙**: 2루가 포스라면 항상 2루 우선.
> 이유: 2루수/유격수 → 1루 송구 거리(27.43m)가 가장 짧아 병살 성공률이 가장 높음.
>
> 만루에서 홈 포스도 있지만 홈 → 1루(36.5m)보다 2루 → 1루(27.43m)가 빠름.
> 실제 야구에서도 만루 내야 그라운더는 대개 2루 or 홈 포스 후 1루로 감.
> MVP에서는 항상 2루 우선. (N1 고도화로 추후 내야수 위치 기반 선택 가능)

포스 주자 없음(`runners.first === null`) → `null` 반환 → 일반 아웃 처리.

---

### Step 2 — 3루 주자 홈 도전 판단

포스 처리와 별개로, **비포스** 3루 주자가 있을 때 홈 도전 여부 결정.

```typescript
function decide3BRunnerHome(
  runner:        Player,
  initial_bs:    BallState,
  outs:          number,         // 포스아웃 이전 아웃 수
  forceOutCount: number,         // 이번 포스로 추가될 아웃 수
  defenceLineup: Player[],
): boolean {
  const effectiveOuts = outs + forceOutCount

  // 2아웃(포스 후 기준) → 무조건 홈 도전
  if (effectiveOuts >= 2) return true

  // 그 외: 물리 판단
  const dist = euclidDist(BASE_POS['3B'], BASE_POS['home'])
  return decideChallengeAdvance(runner, dist, initial_bs, 'home', defenceLineup)
}
```

**포스 주자가 3루 주자인 경우 (만루)**: 3루 주자는 이미 홈으로 포스 진루.
위 함수는 **비포스** 3루 주자에만 적용 (1루만 있을 때 또는 1·2루일 때의 3루 주자).

---

### Step 3 — 병살 판정

```typescript
function resolveDP(
  pivotBase:     2 | 3 | 'home',
  pivotMan:      Player,
  batter:        Player,
  defenceLineup: Player[],
): 'double_play' | 'fielders_choice' {
  const pivot_pos    = BASE_POS[pivotBase === 2 ? '2B' : pivotBase === 3 ? '3B' : 'home']
  const throw_speed  = (80 + pivotMan.stats.throw * 0.7) / 3.6
  const throw_dist   = euclidDist(pivot_pos, BASE_POS['1B'])

  const pivot_throw_time  = 0.3 + throw_dist / throw_speed      // relay_reaction + 송구 비행
  const batter_run_speed  = 5.0 + (batter.stats.running / 100) * 3.0
  const t_batter_to_1B    = 27.43 / batter_run_speed

  return t_batter_to_1B > pivot_throw_time ? 'double_play' : 'fielders_choice'
}
```

---

### Step 4 — 야수 선택 결과 결정 (`FieldersChoiceRule` 적용)

```typescript
function applyFieldersChoiceRule(
  dpResult:   'double_play' | 'fielders_choice',
  rule:       FieldersChoiceRule,
  hasForce:   boolean,  // 포스 주자가 실제로 존재했는지
): AtBatResult {
  if (dpResult === 'double_play') return 'double_play'

  // 타자가 1루 세이프인 경우 (fielders_choice)
  if (rule === 'mlb') {
    // MLB: 포스 아웃 시도 자체로 야수 선택 판정
    return 'fielders_choice'
  } else {
    // standard: 선행 주자도 세이프가 됐어야 야수 선택 → 여기선 포스아웃 확정이므로 일반 out
    // (선행 주자는 포스아웃으로 이미 아웃 → 타자가 세이프 되어도 fielders_choice가 아님)
    return 'fielders_choice'  // 포스아웃 시도 시 standard도 동일: 타자 세이프 = FC
  }
  // ※ standard 기준의 진정한 차이는 "포스 없이 선행 주자를 노렸을 때"에서 발생.
  // 현재 MVP 범위(포스 상황만)에서는 두 기준의 결과가 동일.
  // 추후 비포스 상황 야수 선택(예: 2루 주자 3루 송구) 구현 시 분기 차이 발생.
}
```

> **Note**: 현재 MVP에서는 포스 상황만 다루므로 두 기준의 실질 차이가 없음.
> `FieldersChoiceRule`은 타입과 설정만 추가하고, 비포스 야수 선택 시나리오는 추후 구현.

---

### `resolveInfieldOut` 전체 흐름

```typescript
export function resolveInfieldOut(
  runners:       Runners,
  batter:        Player,
  hp:            HitResultDetail,
  outs:          number,
  defenceLineup: Player[],
  scoreContext?:  { battingScore: number; defenseScore: number },
  inningCtx?:    { inning: number; isTop: boolean },
  fcRule:        FieldersChoiceRule = 'mlb',
): AdvanceResult {
  const moves:  RunnerMove[]  = []
  const events: GameEvent[]   = []
  let   next:   Runners       = { first: null, second: null, third: null }
  let   outs_added = 0
  let   runsScored = 0

  // 1. 포스 베이스 감지
  const pivot = detectPivotBase(runners)

  if (!pivot) {
    // 포스 없음 → 타자만 아웃, 주자 이동 없음 (기존 동작 유지)
    next = { ...runners }
    return { nextRunners: next, runsScored: 0, outs_added: 0, moves, events }
  }

  // 2. 포스 주자 전원 아웃 처리
  for (const fo of pivot.forceRunners) {
    outs_added++
    moves.push({ runner: fo.runner, from: fo.from, to: fo.to })
    events.push({
      type: 'force_out',
      inning: inningCtx?.inning ?? 0,
      isTop:  inningCtx?.isTop  ?? false,
      payload: { runner: fo.runner, from: fo.from, to: fo.to },
    })
    // 득점 처리 (홈 포스 → 득점)
    if (fo.to === 'home') runsScored++
  }

  // 3. 비포스 주자 배치 (포스가 아닌 주자는 제자리)
  if (!pivot.forceRunners.some(f => f.from === 3) && runners.third) {
    // 3루 주자 홈 도전 판단
    const initial_bs: BallState = {
      phase: 'fielding',
      t_remaining: hp.t_fielding,
      fielder_pos: hp.fielder_pos,
      fielder: hp.fielder,
    }
    const goHome = decide3BRunnerHome(
      runners.third, initial_bs, outs, outs_added, defenceLineup,
    )
    if (goHome) {
      runsScored++
      moves.push({ runner: runners.third, from: 3, to: 'home' })
    } else {
      next.third = runners.third
    }
  }
  if (!pivot.forceRunners.some(f => f.from === 2) && runners.second) {
    next.second = runners.second   // 2루 주자 비포스: 제자리
  }

  // 4. 병살 판정
  const pivotMan = getReceiverAtBase(
    pivot.pivotBase === 2 ? '2B' : pivot.pivotBase === 3 ? '3B' : 'home',
    defenceLineup,
  ).player
  const dpResult = resolveDP(pivot.pivotBase, pivotMan, batter, defenceLineup)
  const atBatResult = applyFieldersChoiceRule(dpResult, fcRule, true)

  if (atBatResult === 'double_play') {
    // 타자도 아웃
    outs_added++
    moves.push({ runner: batter, from: 'batter', to: 1 })
  } else {
    // 타자 1루 세이프
    next.first = batter
    moves.push({ runner: batter, from: 'batter', to: 1 })
  }

  return { nextRunners: next, runsScored, outs_added, moves, events }
}
```

---

## `advanceRunners` 분기 추가

```typescript
// advanceRunners() 내, fixedAdvance 앞에 삽입
if (result === 'out' && hitPhysics?.is_infield) {
  return resolveInfieldOut(
    runners, batter, hitPhysics, ctx_outs ?? 0,
    defenceLineup, scoreContext, inningCtx,
    GAME_CONFIG.fielders_choice_rule,
  )
}
```

`advanceRunners`에 `outs` 파라미터 추가 필요:

```typescript
export function advanceRunners(
  result:         AtBatResult,
  runners:        Runners,
  batter:         Player,
  hitPhysics?:    HitResultDetail,
  stealState?:    StealState,
  defenceLineup?: Player[],
  scoreContext?:  { battingScore: number; defenseScore: number },
  inningCtx?:     { inning: number; isTop: boolean },
  outs?:          number,   // 추가: 병살 2아웃 판단용
): AdvanceResult
```

`at-bat.ts`의 두 `advanceRunners` 호출에 `ctx.outs` 전달.

---

## `pbp-text.ts` 업데이트

```typescript
case 'double_play':    return `${batter.name} 병살타!`
case 'fielders_choice': return `${batter.name} 야수 선택`
```

---

## `at-bat.ts` 처리

`at_bat_result`가 `'double_play'`인 경우 아웃 카운트 처리:

```typescript
// 기존 코드
const atBatOut = batting.at_bat_result === 'strikeout' || batting.at_bat_result === 'out' ? 1 : 0

// 변경
const atBatOut =
  batting.at_bat_result === 'strikeout'      ||
  batting.at_bat_result === 'out'            ||
  batting.at_bat_result === 'double_play'    ||
  batting.at_bat_result === 'fielders_choice'
    ? 1 : 0
// outs_added는 resolveInfieldOut 내부에서 포스아웃 + 타자아웃 모두 계산하므로
// atBatOut은 0으로 처리하고 runnerOuts에 전체 위임하는 방식도 가능 (아래 참고)
```

> **설계 선택**: `outs_added` 중복 계산 방지를 위해 `double_play` / `fielders_choice`일 때
> `atBatOut = 0`으로 설정하고, `resolveInfieldOut`의 `outs_added`에 전체 아웃을 위임한다.

```typescript
const atBatOut =
  batting.at_bat_result === 'strikeout' ? 1 :
  batting.at_bat_result === 'out'       ? 1 :
  0  // double_play/fielders_choice는 runnerOuts(resolveInfieldOut)에 포함
```

---

## 엣지 케이스

| 케이스 | 처리 |
|--------|------|
| 포스 주자 없음 (주자 없거나 1루 비어있음) | `detectPivotBase` → null → 일반 `'out'` 처리 |
| 이미 2아웃 | `outs >= 2`이면 `resolveInfieldOut` 진입하지 않음 (병살 조건 불필요) |
| 홈 포스 주자 득점 | `runsScored++` 처리 (포스아웃이어도 홈을 밟으면 득점) — 실제 야구와 동일 |
| 3루 주자 홈 도전 성공 후 병살 | 3루 주자 득점 + 병살 완성 모두 기록 가능 |

---

## Plan

### Phase A — 타입 & 설정 추가

- [ ] `batting/types.ts`: `AtBatResult`에 `'double_play' | 'fielders_choice'` 추가
- [ ] `game/types.ts`: `GameEventType`에 `'force_out'` 추가, 주석 정리
- [ ] `game/config.ts`: `FieldersChoiceRule` 타입 + `GAME_CONFIG.fielders_choice_rule` 추가

### Phase B — 핵심 로직 구현

- [ ] `game/runner-advance.ts`: `detectPivotBase` 함수 구현
- [ ] `game/runner-advance.ts`: `decide3BRunnerHome` 함수 구현
- [ ] `game/runner-advance.ts`: `resolveDP` 함수 구현
- [ ] `game/runner-advance.ts`: `resolveInfieldOut` 함수 구현 (A~C 통합)
- [ ] `game/runner-advance.ts`: `advanceRunners`에 `outs?` 파라미터 추가 및 분기 삽입

### Phase C — 호출부 연결

- [ ] `game/at-bat.ts`: `advanceRunners` 두 호출에 `ctx.outs` 전달
- [ ] `game/at-bat.ts`: `atBatOut` 계산에서 `double_play` / `fielders_choice` 처리 (0으로 위임)

### Phase D — 텍스트 & 빌드

- [ ] `game/pbp-text.ts`: `double_play` / `fielders_choice` 텍스트 추가
- [ ] `pnpm build` 통과 확인
- [ ] TypeScript 에러 0건 확인

---

## 테스트 계획

### 기존 기능 회귀 검증

| 시나리오 | 기대 결과 |
|---------|---------|
| 주자 없음 + 내야 그라운더 아웃 | `outs_added=1`, 주자 이동 없음 (기존 동작 유지) |
| 2루 주자만 + 내야 그라운더 아웃 | `outs_added=1`, 2루 주자 제자리 (포스 없음) |
| 삼진 / 볼넷 / 홈런 | `advanceRunners` 기존 분기 그대로 |

### 신규 기능 검증

| 시나리오 | 기대 결과 |
|---------|---------|
| 1루 주자 + 내야 그라운더 | 1루 주자 2루 아웃, 타자 병살 or 세이프 |
| 1·2루 + 내야 그라운더 | 1루→2루 아웃, 2루→3루 아웃, 병살 판정 |
| 만루 + 내야 그라운더 | 전 주자 포스 진루+아웃, 홈 포스 득점 처리 |
| 2아웃 + 1루 주자 + 내야 그라운더 | 병살 발동 안 함 (이미 2아웃) |
| 1루 주자 + 3루 주자 + 내야 그라운더 | 1루→2루 포스아웃, 3루 주자 홈 도전 판단 실행 |
| 포스아웃 후 실질 2아웃 + 3루 주자 | 3루 주자 무조건 홈 도전 |

---

## 데이터 흐름

```
hitBall()
  → at_bat_result: 'out', hit_physics.is_infield: true
      ↓
advanceRunners('out', runners, batter, hitPhysics, ..., outs)
  ↓
  [분기] hitPhysics.is_infield === true?
    YES → resolveInfieldOut(runners, batter, hp, outs, ...)
            ↓
            detectPivotBase(runners)
              → forceRunners[], pivotBase, pivotMan  (또는 null)
            ↓
            [포스 없음] → { outs_added: 0, nextRunners: runners(유지) }
            [포스 있음]
              ↓
              포스 주자 전원 아웃 처리 → outs_added++, force_out 이벤트
              ↓
              3루 주자(비포스) 홈 도전 판단
                decide3BRunnerHome(runner, initial_bs, outs, forceOutCount)
                  → true: runsScored++
                  → false: next.third = runner
              ↓
              resolveDP(pivotBase, pivotMan, batter)
                → pivot_throw_time vs t_batter_to_1B
                → 'double_play' | 'fielders_choice'
              ↓
              double_play   → outs_added++ (타자 아웃)
              fielders_choice → next.first = batter (타자 1루)
            ↓
            return AdvanceResult { nextRunners, runsScored, outs_added, moves, events }
    NO  → fixedAdvance / resolveRunnerAdvances (기존 경로)
```

---

## Risk & Rollback

### R1. `outs_added` 이중 계산 (중요)

**리스크**: `at-bat.ts`에서 `atBatOut`을 1로 계산하면서 `resolveInfieldOut`도 포스+타자 아웃을 `outs_added`에 포함하면 총 아웃이 실제보다 1 많아진다.

**해결**: `double_play` / `fielders_choice` 결과일 때 `atBatOut = 0`으로 처리. `resolveInfieldOut`의 `outs_added`에 모든 아웃을 위임.

```typescript
// at-bat.ts
const atBatOut =
  batting.at_bat_result === 'strikeout' ? 1 :
  batting.at_bat_result === 'out'       ? 1 :
  0   // double_play / fielders_choice → resolveInfieldOut 내 outs_added에 위임
```

### R2. 만루 홈 포스 득점 처리

**리스크**: 포스아웃으로 홈을 밟은 3루 주자는 아웃이지만, 실제 야구에서는 홈을 밟기 전에 아웃되면 득점이 안 된다. 그러나 **포스아웃 타이밍 판정 없음(=항상 아웃)** 원칙 하에서는 "홈 포스아웃 = 아웃이지만 득점"이 야구 규칙과 일치한다 (공이 홈에 먼저 도달해 아웃된 게 아니라 타자가 1루로 밀어내는 것이므로, 3루 주자는 홈을 밟고 아웃됨).

**결론**: `runsScored++` 처리 유지. 추후 에러(#6) 구현 시 "포스아웃 실패 → 득점 취소" 케이스 추가.

### R3. `detectPivotBase` pivotBase 선택 — 2루 고정의 한계

**리스크**: 1·2루 상황에서 타구가 3루수 방향이면 실제로 3루→1루 DP(5-3)가 더 빠를 수 있다. 2루 고정이면 비현실적인 경우가 생긴다.

**수용**: MVP에서는 2루 우선 고정. N1(포스 베이스 고도화)에서 `hp.fielder.position_1` 기반으로 최적 베이스 선택 로직 추가 가능.

### 롤백 계획

이번 변경은 `advanceRunners` 내 신규 분기 추가이며 기존 경로를 건드리지 않는다. 문제 발생 시:

1. `advanceRunners`의 `is_infield` 분기 조건을 `false`로 고정 → 기존 동작 즉시 복구
2. 타입 변경(`AtBatResult`)은 기존 `switch` 문의 `default` 처리가 있으므로 런타임 오류 없음
