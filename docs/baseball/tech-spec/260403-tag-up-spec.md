---
title: "Tech Spec — 수비 엔진 #5 태그업 (Tag-Up)"
date: 2026-04-03
owner: @dkuzifan
status: draft
---

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/baseball/game/config.ts` | `LINE_DRIVE_THRESHOLD` 상수 추가 |
| `src/lib/baseball/defence/types.ts` | `HitResultDetail.catch_setup_time` — 주석 "예약" 제거 |
| `src/lib/baseball/batting/hit-result.ts` | `catch_setup_time` 계산 로직 추가 |
| `src/lib/baseball/defence/throw-judge.ts` | `BallState.in_air` 주석 "타입 예약" 제거 |
| `src/lib/baseball/game/types.ts` | `GameEventType`에 `'tag_up'`, `'sac_fly'` 추가 |
| `src/lib/baseball/game/stats-types.ts` | `BatterGameStats`에 `SF: number` 추가 |
| `src/lib/baseball/game/runner-advance.ts` | `resolveOutfieldFlyOut`, `resolveLDDoublePlay` 추가; `advanceRunners` 분기 추가 |
| `src/lib/baseball/game/calc-game-stats.ts` | `sac_fly` 이벤트 처리, `SF` 누적 |
| `src/lib/baseball/game/pbp-text.ts` | `sac_fly` 텍스트 추가 |

---

## 상수

`config.ts`에 추가:

```typescript
export const LINE_DRIVE_THRESHOLD = 0.8  // s — 이 미만이면 라인 드라이브로 판정
```

---

## 1. `catch_setup_time` 계산 — `hit-result.ts`

`resolveHitResult`의 아웃 판정 분기에 추가:

```typescript
// 7. 아웃 판정
if (Math.random() < p_out) {
  const catch_setup_time = p_out >= 0.5 ? 0.2 : 0.4
  return { result: 'out', fielder, fielder_pos, t_fielding, t_ball_travel, is_infield, catch_setup_time }
}
```

- `p_out >= 0.5` (일반 포구) → `0.2s`
- `p_out < 0.5` (어려운 포구, 다이빙 캐치 등) → `0.4s`
- 안타/홈런은 `catch_setup_time` 불필요 — 할당하지 않음 (`undefined`)

---

## 2. `GameEventType` 추가 — `types.ts`

```typescript
| 'tag_up'   // { runner: Player; from: 1|2|3; to: 1|2|3|'home'; safe: boolean }
| 'sac_fly'  // { batter: Player }
```

기존 주석 `// 향후 추가: 'error' | 'tag_up'` 제거.

---

## 3. `BatterGameStats` 필드 추가 — `stats-types.ts`

```typescript
export interface BatterGameStats {
  // ... 기존 필드 ...
  SF: number   // 희생플라이
}
```

`makeBatterStats` 초기값에 `SF: 0` 추가.

---

## 4. `resolveOutfieldFlyOut` — `runner-advance.ts`

### 시그니처

```typescript
function resolveOutfieldFlyOut(
  runners:        Runners,
  batter:         Player,
  hp:             HitResultDetail,
  defenceLineup:  Player[],
  scoreContext?:  { battingScore: number; defenseScore: number },
  inningCtx?:     { inning: number; isTop: boolean },
  outs?:          number,
): AdvanceResult & { sac_fly: boolean }
```

### 로직

```
※ 2아웃 시 이 함수는 호출되지 않음 (advanceRunners에서 필터링).
  2아웃에서는 타구 즉시 주자가 달리므로 태그업 대기 개념이 없음.
  외야 플라이아웃 = 3번째 아웃 → fixedAdvance 경로로 처리.

1. ball_state = {
     phase: 'held',
     fielder: hp.fielder,
     fielder_pos: hp.fielder_pos,
   }
   (포구 완료 = 외야수가 공을 쥔 상태)

3. reaction_delay = hp.catch_setup_time ?? 0.2
   (태그업 출발 전 수비수 송구 준비 시간)

4. 처리 순서: 3루 → 2루 → 1루 (앞 주자 우선, 충돌 방지)

   각 주자마다:
   a. lead_dist    = calcPitchLead(runner)
   b. runner_speed = 5.0 + (runner.stats.running / 100) * 3.0
   c. runner_dist  = dist(base → next) + lead_dist
      (귀루 시간이 runner_dist에 포함되어 decideChallengeAdvance에서 자연스럽게 불리하게 작용)
   d. adjusted_bs  = adjustBallState(ball_state, reaction_delay)
      (포구 후 준비 시간만큼 공 경과)
   e. willChallenge = decideChallengeAdvance(runner, runner_dist, adjusted_bs, nextBase, lineup)
   f. willChallenge === false  → 태그업 포기, 현재 베이스 유지
   g. willChallenge === true   → resolveThrow 로 safe/out 판정
      - safe  → 진루 (home이면 runsScored++)
      - out   → outs_added++

5. outs === 1 (포구로 2아웃) 이고 귀루 아웃이 발생한 경우:
   - 귀루 아웃 = 3번째 아웃
   - 2번째 아웃(포구) 이전에 득점이 확정된 주자(이미 홈 통과)는 유효
   - 귀루 아웃 이후 처리 중인 주자의 진루 시도는 무효
   구현: outs_added가 1이 된 시점 이후 루프를 중단

6. sac_fly = (runsScored > 0)
```

### tag_up 이벤트 emit

```typescript
events.push({
  type: 'tag_up',
  inning: inningCtx?.inning ?? 0,
  isTop:  inningCtx?.isTop  ?? false,
  payload: { runner, from: fromBase, to: toBase, safe: verdict === 'safe' },
})
```

### sac_fly 이벤트 emit (득점 발생 시)

```typescript
if (sac_fly) {
  events.push({
    type: 'sac_fly',
    inning: inningCtx?.inning ?? 0,
    isTop:  inningCtx?.isTop  ?? false,
    payload: { batter },
  })
}
```

---

## 5. `resolveLDDoublePlay` — `runner-advance.ts`

### 시그니처

```typescript
function resolveLDDoublePlay(
  runners:        Runners,
  batter:         Player,
  hp:             HitResultDetail,
  defenceLineup:  Player[],
  inningCtx?:     { inning: number; isTop: boolean },
): AdvanceResult
```

### 로직

```
1. 타자 아웃 (라인 드라이브 직접 포구) → outs_added = 1 (at-bat.ts의 atBatOut=1과 합산됨에 주의)
   → 실제로는 atBatOut=1 이미 계산됨, 여기서는 주자 귀루 아웃만 처리 (outs_added는 주자분만)

2. 처리 순서: 3루 → 2루 → 1루

   각 루 주자마다:
   a. lead_dist    = calcPitchLead(runner)
   b. runner_speed = 5.0 + (runner.stats.running / 100) * 3.0
   c. return_time  = lead_dist / runner_speed
      (귀루에 걸리는 시간)

   d. reaction_delay = hp.catch_setup_time ?? 0.2
   e. throw_dist   = euclidDist(hp.fielder_pos, BASE_POS[baseKey])
   f. spd_OF       = (80 + hp.fielder.stats.throw * 0.7) / 3.6
   g. throw_time   = reaction_delay + throw_dist / spd_OF
      (결정론적: 난수 없음)

   h. return_time > throw_time  → 귀루 아웃  (outs_added++)
      return_time ≤ throw_time  → 귀루 성공, 현재 베이스 유지

3. 진루 없음 (귀루 성공 주자는 현재 베이스에 그대로)
   → 태그업은 다음 resolveOutfieldFlyOut에서 처리 (t_ball_travel >= threshold 조건)
   → 라인 드라이브 직접 포구 상황에서는 태그업 없음 (t_ball_travel < threshold이므로 분기 구분)
```

---

## 6. `advanceRunners` 분기 추가 — `runner-advance.ts`

기존:
```typescript
if (result === 'out' && hitPhysics?.is_infield) {
  return resolveInfieldOut(...)
}

if (!hitPhysics || result === 'strikeout' || result === 'out' || ...) {
  return fixedAdvance(result, runners, batter)
}
```

변경 후:
```typescript
if (result === 'out' && hitPhysics?.is_infield) {
  return resolveInfieldOut(...)
}

// 외야 아웃 분기 (태그업 / 라인 드라이브 DP)
if (result === 'out' && hitPhysics && !hitPhysics.is_infield) {
  const lineup = defenceLineup ?? []
  if (hitPhysics.t_ball_travel < LINE_DRIVE_THRESHOLD) {
    // 라인 드라이브: 귀루 아웃 체크 (아웃 수 무관 — 타자 아웃 후 주자 귀루 판정)
    return resolveLDDoublePlay(runners, batter, hitPhysics, lineup, inningCtx)
  } else if ((outs ?? 0) < 2) {
    // 0~1아웃 외야 플라이아웃: 태그업
    // 2아웃은 타구 즉시 주자가 달리므로 태그업 없음 → fixedAdvance로 fall-through
    return resolveOutfieldFlyOut(runners, batter, hitPhysics, lineup, scoreContext, inningCtx, outs)
  }
  // 2아웃 외야 플라이아웃: fixedAdvance 경로로 fall-through
}

if (!hitPhysics || result === 'strikeout' || result === 'out' || ...) {
  return fixedAdvance(result, runners, batter)
}
```

`LINE_DRIVE_THRESHOLD`는 `config.ts`에서 import.

---

## 7. `calc-game-stats.ts` — SF 처리

`sac_fly` 이벤트 케이스 추가:

```typescript
case 'sac_fly': {
  const batter = event.payload.batter as Player
  const b = getBatter(offState, batter)
  b.SF++
  // 참고: SAC F는 타수(AB)에 포함되지 않음 — AB 증가 없음
  // 타점(RBI)은 'runner_advance' 이벤트의 runsScored로 처리됨 (기존 로직 재사용)
  break
}
```

`makeBatterStats`에 `SF: 0` 초기값 추가.

---

## 8. `pbp-text.ts` — sac_fly 텍스트

```typescript
// atBatResultToText에서 사용하는 별도 함수 또는 GameEventType별 텍스트 함수 추가
export function sacFlyToText(): string {
  return '희생플라이'
}
```

또는 UI에서 `event.type === 'sac_fly'` 감지 시 직접 텍스트 표시.

---

## 데이터 흐름 요약

```
resolveHitResult (hit-result.ts)
  └─ result='out', !is_infield, catch_setup_time 계산
        ↓
advanceRunners (runner-advance.ts)
  ├─ t_ball_travel < 0.8s  →  resolveLDDoublePlay
  │     └─ 귀루 시간 vs 송구 시간 비교 (결정론적)
  │         → outs_added (주자 귀루 아웃)
  │         → nextRunners (귀루 성공 주자 유지)
  │
  └─ t_ball_travel >= 0.8s  →  resolveOutfieldFlyOut
        └─ decideChallengeAdvance (runner_dist + lead_dist)
            → 태그업 도전 여부
            → resolveThrow → safe/out
            → runsScored, outs_added
            → tag_up 이벤트, sac_fly 이벤트

calcGameStats (calc-game-stats.ts)
  └─ sac_fly 이벤트 → BatterGameStats.SF++
```

---

## 셀프 리뷰

**Denis (프론트엔드)**: `tag_up` 이벤트 payload에 `safe: boolean`이 있어 UI에서 "태그업 성공/실패" 표시가 가능합니다. `sac_fly` 이벤트는 `at_bat_result` 이후에 emit되므로, UI가 `result='out'` 다음에 `sac_fly`를 감지해 "희생플라이" 라벨을 덮어쓸 수 있습니다.
→ 쉽게 말하면: 화면에 단순 "아웃" 대신 "희생플라이"가 뜨려면 이벤트 순서가 맞아야 하는데, 설계상 문제없습니다.

**Bitsaion (백엔드)**: `runner_speed` 계산(`5.0 + running/100 * 3.0`)이 `runner-advance.ts` 내 여러 함수에서 반복됩니다. `resolveOutfieldFlyOut`과 `resolveLDDoublePlay`에서도 동일한 공식을 사용하므로, 파일 상단에 `calcRunnerSpeed(runner: Player): number` 헬퍼를 추출하는 것이 맞습니다.
→ 쉽게 말하면: 속도 계산 공식이 3군데 이상 복붙되면 나중에 수정할 때 하나를 빠트리기 쉬우니 한 곳에 모읍니다.

**Zhihuan (테크 리드)**: `resolveOutfieldFlyOut`의 반환 타입이 `AdvanceResult & { sac_fly: boolean }`으로 확장됩니다. `advanceRunners`의 반환 타입은 `AdvanceResult`이므로, `sac_fly` 정보는 내부에서 `sac_fly` 이벤트로 emit하고 외부로 노출하지 않는 것이 인터페이스를 깔끔하게 유지합니다. 반환 타입을 `AdvanceResult`로 통일하면 됩니다.
→ 쉽게 말하면: SAC F 여부는 이벤트로 전달하면 충분하니, 반환값을 굳이 확장하지 않아도 됩니다.

---

Zhihuan의 지적 반영 — `resolveOutfieldFlyOut` 시그니처를 `AdvanceResult`로 통일:

```typescript
function resolveOutfieldFlyOut(
  runners:        Runners,
  batter:         Player,
  hp:             HitResultDetail,
  defenceLineup:  Player[],
  scoreContext?:  { battingScore: number; defenseScore: number },
  inningCtx?:     { inning: number; isTop: boolean },
  outs?:          number,
): AdvanceResult  // sac_fly 여부는 이벤트로만 전달
```

Bitsaion의 지적 반영 — `calcRunnerSpeed` 헬퍼 추출:

```typescript
function calcRunnerSpeed(runner: Player): number {
  return 5.0 + (runner.stats.running / 100) * 3.0
}
```

기존 `findRunnerTarget`, `calcRunnerDist` 등의 인라인 계산도 이 헬퍼로 교체.
