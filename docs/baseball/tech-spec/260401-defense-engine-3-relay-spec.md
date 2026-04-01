---
title: "Tech Spec — 수비 엔진 #3 중계 플레이 & 공짜 진루"
date: 2026-04-01
prd: docs/baseball/prd/260401-defense-engine-3-relay.md
status: draft
---

## 영향 파일

| 파일 | 변경 유형 |
|------|---------|
| `src/lib/baseball/defence/throw-judge.ts` | **추가** — 5개 함수 |
| `src/lib/baseball/game/runner-advance.ts` | **수정** — resolveLeadingRunner, advanceRunners |
| `src/lib/baseball/game/at-bat.ts` | **수정** — advanceRunners 호출부 (defenceLineup 전달) |

---

## 신규 함수 (`throw-judge.ts`)

### `maxDirectDist(throw_stat)`

```typescript
export function maxDirectDist(throw_stat: number): number {
  return 41.5 * Math.log(throw_stat) - 106
}
```

앵커: Throw 30 → 35m, Throw 100 → 85m.
"직접 송구"는 바운드 포함 — 중계수를 거치지 않는 모든 송구.

| Throw | 거리 |
|-------|------|
| 30 | 35m |
| 70 | 70m |
| 90 | 81m ← LF/RF→홈(80m) 직접 가능 |
| 100 | 85m |
| 110 | 89m ← CF→홈(88m) 직접 가능 |

---

### `calcRelayPos(fielder_pos, target_base_pos)`

```typescript
export function calcRelayPos(
  fielder_pos:    { x: number; y: number },
  target_base_pos: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: fielder_pos.x + (target_base_pos.x - fielder_pos.x) * 0.45,
    y: fielder_pos.y + (target_base_pos.y - fielder_pos.y) * 0.45,
  }
}
```

---

### `selectRelayMan(fielder_pos, defenceLineup)`

```typescript
export function selectRelayMan(
  fielder_pos:    { x: number; y: number },
  defenceLineup:  Player[],
): Player {
  const targetPos: Position = fielder_pos.x > 0 ? 'SS' : '2B'
  const found = defenceLineup.find(
    p => p.position_1 === targetPos || p.position_2 === targetPos,
  )
  if (found) return found

  // lineup에 없으면 dummy (Throw 70)
  return {
    id: 'relay_dummy', team_id: '', name: 'Relay', number: 0,
    age: 25, bats: 'R', throws: 'R',
    position_1: targetPos, position_2: null, position_3: null,
    stats: {
      ball_power: 0, ball_control: 0, ball_break: 0, ball_speed: 0,
      contact: 50, power: 50, defence: 50, throw: 70, running: 50, stamina: 100,
    },
    pitch_types: [], zone_bottom: 0.5, zone_top: 1.1, portrait_url: null,
  }
}
```

`fielder_pos.x > 0` → SS (우측 외야), `≤ 0` → 2B (좌측 외야).

---

### `shouldUseRelay(fielder, fielder_pos, targetPos, t_fielding, relayMan, relayPos)`

```typescript
export function shouldUseRelay(
  fielder:     Player,
  fielder_pos: { x: number; y: number },
  targetPos:   { x: number; y: number },
  t_fielding:  number,
  relayMan:    Player,
  relayPos:    { x: number; y: number },
): boolean {
  const spd_OF    = (80 + fielder.stats.throw  * 0.7) / 3.6
  const spd_relay = (80 + relayMan.stats.throw * 0.7) / 3.6
  const dist_direct = euclidDist(fielder_pos, targetPos)

  // ① 도달 불가
  if (dist_direct > maxDirectDist(fielder.stats.throw)) return true

  // ② 직접 송구 vs 중계 속도 비교
  const t_direct = t_fielding + dist_direct / spd_OF
  const t_relay  = t_fielding
                 + euclidDist(fielder_pos, relayPos) / spd_OF
                 + 0.8
                 + euclidDist(relayPos, targetPos)   / spd_relay

  return t_relay < t_direct   // 중계가 더 빠르면 relay 사용
}
```

---

### `resolveRelayThrow(fielder, fielder_pos, relayMan, targetPos, t_fielding, runner, runner_dist)`

```typescript
export function resolveRelayThrow(
  fielder:      Player,
  fielder_pos:  { x: number; y: number },
  relayMan:     Player,
  targetPos:    { x: number; y: number },
  t_fielding:   number,
  runner:       Player,
  runner_dist:  number,
): 'safe' | 'out' {
  const spd_OF    = (80 + fielder.stats.throw  * 0.7) / 3.6
  const spd_relay = (80 + relayMan.stats.throw * 0.7) / 3.6
  const relay_pos = calcRelayPos(fielder_pos, targetPos)

  const t_total = t_fielding
                + euclidDist(fielder_pos, relay_pos) / spd_OF
                + 0.8
                + euclidDist(relay_pos, targetPos)   / spd_relay

  const runner_speed = 5.0 + (runner.stats.running / 100) * 3.0
  const t_runner     = runner_dist / runner_speed
  const margin       = t_total - t_runner

  return Math.random() < sigmoid(margin, 0.5) ? 'safe' : 'out'
}
```

`sigmoid`는 기존 파일 내 private 함수 그대로 재사용.

---

## 수정 함수 (`runner-advance.ts`)

### `resolveLeadingRunner` — 시그니처 변경 & 중계 분기 추가

```typescript
// 기존
function resolveLeadingRunner(
  runners:     Runners,
  result:      'single' | 'double',
  hp:          HitResultDetail,
  stealState?: StealState,
)

// 변경
function resolveLeadingRunner(
  runners:       Runners,
  result:        'single' | 'double',
  hp:            HitResultDetail,
  stealState?:   StealState,
  defenceLineup?: Player[],
)
```

내부 `resolveThrow()` 호출 직전에 중계 여부를 판단하는 블록 삽입:

```typescript
// 공통 패턴 (single 홈 송구 예시)
const targetPos  = BASE_POS['home']
const relayMan   = selectRelayMan(fielder_pos, defenceLineup ?? [])
const relayPos   = calcRelayPos(fielder_pos, targetPos)
const useRelay   = shouldUseRelay(hp.fielder, fielder_pos, targetPos, hp.t_fielding, relayMan, relayPos)

const verdict = useRelay
  ? resolveRelayThrow(hp.fielder, fielder_pos, relayMan, targetPos, hp.t_fielding, runner, runner_dist)
  : resolveThrow(hp.fielder, throw_dist, hp.t_fielding, runner, runner_dist)
```

적용 위치 (총 3곳):
1. single — 2루 주자 → 홈
2. single — 1루 주자 → 3루
3. double — 1루 주자 → 홈

---

### `advanceRunners` — 시그니처 확장 & 공짜 진루 처리

```typescript
// 기존
export function advanceRunners(
  result:      AtBatResult,
  runners:     Runners,
  batter:      Player,
  hitPhysics?: HitResultDetail,
  stealState?: StealState,
): AdvanceResult

// 변경
export function advanceRunners(
  result:         AtBatResult,
  runners:        Runners,
  batter:         Player,
  hitPhysics?:    HitResultDetail,
  stealState?:    StealState,
  defenceLineup?: Player[],
): AdvanceResult
```

**공짜 진루 블록 — single 분기에 추가:**

```typescript
if (result === 'single') {
  const leadResult = resolveLeadingRunner(
    runners, 'single', hitPhysics, stealState, defenceLineup,
  )
  runsScored += leadResult.runsScored
  outs_added += leadResult.outs_added
  moves.push(...leadResult.moves)
  next = { ...next, ...leadResult.nextRunners }

  // [NEW] 공짜 진루: 2루 주자가 leading이었고 1루 주자가 있으면 → 1루 주자 2루 FREE
  if (runners.second !== null && runners.first !== null) {
    const freeRunner = runners.first
    next.second = freeRunner
    next.first  = null
    moves.push({ runner: freeRunner, from: 1, to: 2 })
  }

  // 타자 진루: 2루가 점유됐으면 1루로 fallback
  const batterBase = resolveBatterAdvance(batter, hitPhysics)
  if (batterBase === 2 && next.second === null) {
    next.second = batter
    moves.push({ runner: batter, from: 'batter', to: 2 })
  } else {
    next.first = batter
    moves.push({ runner: batter, from: 'batter', to: 1 })
  }
}
```

---

## `at-bat.ts` 호출부 수정

`advanceRunners` 호출 2곳 모두 `defenceLineup` 추가:

```typescript
// 도루 분기
advanceRunners(result, runners, batter, hit_physics, stealState, defenceLineup)

// 일반 분기
advanceRunners(result, runners, batter, hit_physics, undefined, defenceLineup)
```

`runAtBat(pitcher, batter, ctx, defenceLineup?)` — 기존 파라미터 그대로 전달.

---

## 데이터 흐름

```
[at-bat.ts]
  runAtBat(pitcher, batter, ctx, defenceLineup)
    → hitBall() → BattingResult { hit_physics }
    → advanceRunners(result, runners, batter, hit_physics, stealState?, defenceLineup)

[runner-advance.ts]
  advanceRunners()
    single / double 분기:
      resolveLeadingRunner(runners, result, hp, stealState, defenceLineup)
        selectRelayMan(fielder_pos, defenceLineup)   → relayMan
        calcRelayPos(fielder_pos, targetPos)          → relayPos
        shouldUseRelay(...)                           → boolean
          true  → resolveRelayThrow(...)
          false → resolveThrow(...)
        → { nextRunners, runsScored, outs_added, moves }

      [공짜 진루] runners.second && runners.first
        → next.second = runners.first (FREE)
        → next.first  = null

      resolveBatterAdvance(batter, hp)
        → batterBase (1 or 2)
        → 점유 충돌 시 1루 fallback

    → AdvanceResult { nextRunners, runsScored, outs_added, moves }
```

---

## 구현 계획 (Phase)

### Phase A — `throw-judge.ts` 신규 함수
- [ ] `maxDirectDist`
- [ ] `calcRelayPos`
- [ ] `selectRelayMan` (dummy 포함)
- [ ] `shouldUseRelay`
- [ ] `resolveRelayThrow`
- [ ] `euclidDist` export 여부 확인 (현재 private — relay 계산에 필요)

### Phase B — `runner-advance.ts` 수정
- [ ] `resolveLeadingRunner` 시그니처에 `defenceLineup?` 추가
- [ ] 3곳 모두 중계 분기 삽입 (single홈 / single3루 / double홈)
- [ ] `advanceRunners` 시그니처에 `defenceLineup?` 추가
- [ ] single 분기: 공짜 진루 블록 추가
- [ ] 타자 2루 fallback 처리

### Phase C — `at-bat.ts` 호출부 수정
- [ ] 도루 분기 `advanceRunners` 호출에 `defenceLineup` 추가
- [ ] 일반 분기 `advanceRunners` 호출에 `defenceLineup` 추가

### Phase D — 검증
- [ ] `tsc --noEmit` 빌드 오류 없음
- [ ] `runGame` 9이닝 정상 완주
- [ ] 1·2루 단타 시나리오: 1루 주자 2루 도달 확인
- [ ] Throw 30 외야수(LF): dist_home ≈ 80m > maxDirectDist(30)=35m → 중계 발동 확인
- [ ] Throw 100 외야수: dist_home ≈ 80m > maxDirectDist(100)=75m → 중계 발동 확인
  - (홈까지 80m는 Throw 100도 직접 불가 → 항상 중계인지 검증)

---

## Risk & Rollback

| # | 리스크 | 대응 |
|---|--------|------|
| R1 | `euclidDist`가 현재 private — `resolveRelayThrow`/`shouldUseRelay`에서 호출 불가 | Phase A에서 `export` 추가 (기존 내부 사용 영향 없음) |
| R2 | `defenceLineup` 미전달(undefined) → `selectRelayMan` 빈 배열 받음 → dummy 반환 | dummy Throw 70으로 안전 처리, `??` 기본값 보장 |
| R3 | 공짜 진루 블록에서 `next.second` 덮어쓰기 — double 분기에도 적용 오류 가능성 | 조건 `runners.second !== null && runners.first !== null`은 single 분기 안에만 존재 → double 영향 없음 |
| R4 | 타자 2루 fallback 시 `resolveBatterAdvance`가 2루를 반환했는데 1루로 강제 → stats 기록 불일치 | `at_bat_result: 'single'`은 그대로 유지 (베이스 위치만 다름). 기록 영향 없음 |
| R5 | `resolveRelayThrow` 내부에서 `calcRelayPos` 중복 호출 (shouldUseRelay에서도 호출) | 성능 영향 미미. 필요 시 relay_pos를 외부에서 계산 후 주입하는 방식으로 리팩터링 가능 |

### 롤백 전략
- `defenceLineup` optional 설계로 기존 `advanceRunners` 호출부 변경 없이 동작 유지
- `resolveLeadingRunner`에서 `defenceLineup` 미전달 시 중계 미발동 → 기존 `resolveThrow` 경로 그대로
- Phase A 완료 후 B 실패 시: 새 함수는 추가됐지만 호출되지 않아 경기 루프 정상 동작
