---
title: 수비 시프트 - Tech Spec
date: 2026-04-04
prd: docs/baseball/prd/260404-shift.md
status: draft
---

## 의존성 분석 및 기술 설계

- **API**: 없음
- **DB**: 없음
- **Domain**:
  - 신규 파일: `src/lib/baseball/defence/shift.ts`
  - 수정 파일: `src/lib/baseball/defence/fielder-positions.ts` (SS/2B y좌표 수정)
  - 수정 파일: `src/lib/baseball/game/half-inning.ts` (applyShift 호출 삽입)
  - 수정 파일: `src/lib/baseball/game/types.ts` (`'shift'` GameEventType 추가)
  - 수정 파일: `src/lib/baseball/game/calc-game-stats.ts` (`shift` 이벤트 무시 처리)
- **UI**: 없음 (순수 엔진 레이어)
- **Release Strategy**: 단일 커밋, 기존 `defenceLineup` 인터페이스 변경 없음

---

## FIELDER_DEFAULT_POS 수정 (SS/2B)

MLB Statcast 기준 SS/2B 표준 depth는 39~49m. 현재값 33m은 2루 베이스(38.8m)보다 얕아 비현실적.

```typescript
// 수정 전
SS:   { x:  -8, y:  33 }
'2B': { x:  10, y:  33 }

// 수정 후
SS:   { x:  -8, y:  42 }
'2B': { x:  10, y:  42 }
```

영향 범위: 포구 확률(`calcCatchProbability`), 송구 거리(`resolveThrow`), 중계 위치(`calcRelayPos`) 등 수비 엔진 전체에 반영됨.

---

## 수치 모델

### pull_tendency 파생

```
pull_delta  = (power - 50) / 50          // 범위: -1.0 ~ +1.0
pull_tendency = clamp(0.45 + pull_delta * 0.25, 0.0, 1.0)
```

| power | pull_delta | pull_tendency |
|-------|-----------|---------------|
| 0     | -1.0      | 0.20          |
| 50    | 0.0       | 0.45          |
| 70    | +0.40     | 0.55          |
| 85    | +0.70     | 0.63          |
| 100   | +1.0      | 0.70          |

pull_tendency = 0.45일 때 오프셋 = 0 (DEFAULT_POS 그대로)

### 오프셋 계산

**기준값:**
```
shift_x_delta = pull_tendency - 0.45   // -0.25 ~ +0.25
depth_delta   = (power - 50) / 50      // -1.0  ~ +1.0
```

shift_x_delta > 0 → 풀히팅 방향으로 이동
depth_delta > 0   → 깊어짐 (뒤로), depth_delta < 0 → 앞으로

**포지션별 스케일 계수:**

MLB 실측 기준:
- 내야 dx max: SS 극단 시프트 실측 10~15m → ±13m 채택
- 외야 dy max: 실측 1.5~6m, 시뮬 여유분 반영 → ±6m 채택

내야(SS/2B/3B)는 단순 부호 반전으로 충분하지만, 외야는 타구 방향에서 **멀리 있는 수비수가 가장 크게 이동**해야 하므로 LHB/RHB 스케일을 별도 정의한다.

**내야 (RHB는 dx 부호 반전)**

| 포지션 | dx_scale | dy_scale | 최대 dx | 최대 dy |
|--------|----------|----------|---------|---------|
| SS     | +52      | +4       | ±13m    | ±4m     |
| 2B     | +44      | +4       | ±11m    | ±4m     |
| 3B     | +44      | +4       | ±11m    | ±4m     |
| 1B     | 0        | +4       | 0       | ±4m     |
| C, P   | 0        | 0        | 0       | 0       |

**외야 (LHB/RHB 별도 스케일)**

LHB(공이 1루/RF 방향): LF가 가장 멀리 있어 최대 이동, RF는 이미 그 방향에 있어 소폭 이동.
RHB(공이 3루/LF 방향): RF가 가장 멀리 있어 최대 이동, LF는 이미 그 방향에 있어 소폭 이동.

| 포지션 | dx_scale_L (LHB) | dx_scale_R (RHB) | dy_scale | 최대 dx | 최대 dy |
|--------|-----------------|-----------------|----------|---------|---------|
| LF     | +72             | -20             | +6       | ±18m/±5m | ±6m  |
| CF     | +48             | -48             | +6       | ±12m    | ±6m     |
| RF     | +20             | -72             | +6       | ±5m/±18m | ±6m  |

**최종 좌표 (dx, dy 항상 동시 적용):**
```
// 내야
new_x = DEFAULT_POS.x + dx_scale * shift_x_delta * sign(effectiveBats)

// 외야
new_x = DEFAULT_POS.x + (effectiveBats === 'L' ? dx_scale_L : dx_scale_R) * shift_x_delta

// 공통
new_y = DEFAULT_POS.y + dy_scale * depth_delta
```
- `sign(effectiveBats)`: L → +1, R → -1
- shift_x_delta / depth_delta 모두 동일 입력(power, bats)에서 파생
- dx와 dy는 항상 동시에 결정되는 2D 벡터

**effectiveBats 결정 (스위치히터):**
```
if batter.bats === 'S':
  effectiveBats = pitcher.throws === 'R' ? 'L' : 'R'
else:
  effectiveBats = batter.bats
```

---

## 신규 파일: `src/lib/baseball/defence/shift.ts`

```typescript
// 공개 인터페이스

export function calcPullTendency(power: number): number
// (power - 50) / 50 으로 pull_tendency 계산, clamp(0.0, 1.0)

export function resolveEffectiveBats(batter: Player, pitcher: Player): 'L' | 'R'
// 스위치히터 → pitcher.throws 기준 결정, 비스위치히터 → batter.bats 그대로

export function applyShift(
  lineup:  Player[],
  batter:  Player,
  pitcher: Player,
): { shiftedLineup: Player[]; event: ShiftEvent }
// 1. resolveEffectiveBats
// 2. calcPullTendency → pull_tendency, shift_x_delta, depth_delta
// 3. 포지션별 defence_pos 오버라이드
// 4. ShiftEvent 생성 반환
// 원본 lineup 불변 (spread 복사)

interface ShiftEvent {
  direction:        'left' | 'right'          // effectiveBats 기준, 항상 결정됨
  pull_tendency:    number
  shifted_positions: Array<{
    position: Position
    from: { x: number; y: number }            // DEFAULT_POS 또는 현재 defence_pos
    to:   { x: number; y: number }
  }>
}
```

---

## 수정 파일: `src/lib/baseball/game/half-inning.ts`

`runAtBat` 호출 직전에 `applyShift` 삽입:

```typescript
// 기존
const outcome = runAtBat(currentPitcher, batter, ctx, defenceLineup)

// 수정 후
const { shiftedLineup, event: shiftEvent } = applyShift(
  defenceLineup ?? [], batter, currentPitcher
)
events.push({ type: 'shift', inning, isTop, payload: shiftEvent })
const outcome = runAtBat(currentPitcher, batter, ctx, shiftedLineup)
```

---

## 수정 파일: `src/lib/baseball/game/types.ts`

`GameEventType`에 `'shift'` 추가.

---

## 수정 파일: `src/lib/baseball/game/calc-game-stats.ts`

`shift` 이벤트는 스탯 집계에 영향 없음 — switch에 case 추가 없이 default fall-through로 처리 (현재 switch가 unknown 이벤트를 무시하는 구조이므로 추가 수정 불필요).

---

## Plan (Implementation Checklist)

**Phase A: DEFAULT_POS 수정 + 타입 정의**
- [ ] `fielder-positions.ts` — SS/2B y좌표 33 → 42 수정
- [ ] `types.ts` — `'shift'` GameEventType 추가
- [ ] `types.ts` — `ShiftEventPayload` 인터페이스 정의 (`direction`, `pull_tendency`, `shifted_positions`)

**Phase B: shift.ts 핵심 로직 구현**
- [ ] `SHIFT_SCALE` 상수 정의 — 포지션별 `{ dx_scale, dy_scale }` 테이블
- [ ] `calcPullTendency(power)` — pull_tendency 파생 (clamp 포함)
- [ ] `resolveEffectiveBats(batter, pitcher)` — 스위치히터 타석 방향 결정
- [ ] `applyShift(lineup, batter, pitcher)` — 2D 오프셋 계산 + defence_pos 오버라이드 + ShiftEvent 생성

**Phase C: half-inning.ts 연동**
- [ ] `applyShift` import 추가
- [ ] `defenceLineup ?? []` fallback 처리 후 `applyShift` 호출
- [ ] `runAtBat` 직전에 `shiftedLineup`으로 교체
- [ ] `shift` 이벤트 emit

**Phase D: 빌드 확인**
- [ ] `npx tsc --noEmit` 에러 없음

## 테스트 계획

**1. 핵심 기본 플로우 검증 (Regression)**
- [ ] `defenceLineup`이 없는 타석 (`runAtBat(pitcher, batter, ctx, undefined)`) — 기존과 동일하게 동작해야 함
- [ ] 단타/홈런/삼진 결과가 시프트 도입 후에도 동일한 타입으로 반환됨
- [ ] `runner_advance`/`score` 이벤트 순서가 변하지 않음

**2. 시프트 로직 검증**
- [ ] power=50 타자 → `shift_x_delta=0, depth_delta=0` → 모든 수비수 DEFAULT_POS 유지
- [ ] power=100 좌타자 → 내야(SS, 2B, 3B) x 좌표가 DEFAULT보다 커야 함 (1루 방향)
- [ ] power=100 우타자 → 내야 x 좌표가 DEFAULT보다 작아야 함 (3루 방향)
- [ ] 스위치히터 + 우투수 → effectiveBats='L' → 좌타와 동일한 방향 시프트
- [ ] `applyShift` 호출 후 원본 `defenceLineup` 배열의 `defence_pos` 불변 확인
- [ ] C, P 포지션 수비수의 `defence_pos`가 변경되지 않음

---

## 데이터 흐름

### 타석 단위 전체 흐름

```
half-inning.ts (타석 루프)
│
├─ batter = lineup[currentIdx]
│
├─ applyShift(defenceLineup ?? [], batter, currentPitcher)
│     │
│     ├─ resolveEffectiveBats(batter, pitcher)
│     │     bats='S' + pitcher.throws='R' → effectiveBats='L'
│     │     bats='S' + pitcher.throws='L' → effectiveBats='R'
│     │     bats≠'S'                      → effectiveBats=batter.bats
│     │
│     ├─ calcPullTendency(power)
│     │     pull_tendency = clamp(0.45 + (power-50)/50 * 0.25, 0.0, 1.0)
│     │     shift_x_delta = pull_tendency - 0.45   // -0.25 ~ +0.25
│     │     depth_delta   = (power - 50) / 50       // -1.0  ~ +1.0
│     │
│     ├─ 포지션별 (dx, dy) 동시 계산
│     │     new_x = DEFAULT_POS.x + dx_scale * shift_x_delta * sign(effectiveBats)
│     │     new_y = DEFAULT_POS.y + dy_scale * depth_delta
│     │     (C, P: 변경 없음 / 1B: dx_scale=0)
│     │
│     └─ 반환: { shiftedLineup: Player[], event: ShiftEvent }
│           shiftedLineup: 원본 spread 복사 + defence_pos 오버라이드
│           ShiftEvent: { direction, pull_tendency, shifted_positions[{position,from,to}] }
│
├─ events.push({ type: 'shift', inning, isTop, payload: shiftEvent })
│
└─ runAtBat(pitcher, batter, ctx, shiftedLineup)
      │
      └─ hitBall(state, pitch, shiftedLineup)
            │
            └─ resolveHitResult(ev, la, batter, shiftedLineup)
                  │
                  ├─ findResponsibleFielder(landing, shiftedLineup)
                  │     시프트 좌표로 착지점에 가장 가까운 수비수 선택
                  │
                  └─ calcCatchProbability(ballType, dist, ...)
                        시프트 좌표 기준 수비수-착지점 거리로 포구 확률 계산
```

### 불변성 보장

```
원본 defenceLineup ──(spread 복사)──▶ shiftedLineup (defence_pos 오버라이드)
       │                                      │
       │  변경 없음                           │ runAtBat에만 전달
       │                                      │
다음 타석 applyShift 재호출 ◀────────────────┘
```

원본 `defenceLineup`은 이닝 내내 불변. 타석마다 `applyShift`가 새 배열을 생성하므로 이전 타자의 시프트가 다음 타자에게 누적되지 않음.

### calc-game-stats.ts 처리

`shift` 이벤트는 스탯 집계에 영향 없음. switch 문에 `default:` 없이 fall-through 구조이므로 추가 수정 없이 무시됨.

---

## Risk & Rollback

**리스크 1: SS/2B DEFAULT_POS y 변경**
- **영향**: 포구 거리, 송구 거리, 중계 위치 계산 전체에 반영 — 기존 대비 내야 수비 범위 확대
- **발생 조건**: y=33 → 42 변경으로 내야 땅볼 아웃 확률 소폭 감소 (수비수가 더 멀어짐), 외야 중계 플레이 경로 변화
- **롤백 절차**: `fielder-positions.ts`에서 SS/2B y값을 33으로 되돌리면 즉시 원복
- **관찰 포인트**: 내야 타구 아웃 비율 변화, 중계 플레이 판정 빈도

**리스크 2: 시프트 스케일 계수 부정확**
- **영향**: 시프트 효과가 과도하거나 미미해질 수 있음
- **발생 조건**: 특정 포지션 수비수가 DEFAULT_POS에서 20m 이상 이동 시 타구 처리 이상 발생 가능
- **롤백 절차**: `half-inning.ts`에서 `applyShift` 호출을 제거하고 원래 `defenceLineup` 직접 전달
- **관찰 포인트**: 고파워 타자 대비 아웃 확률 분포가 시프트 전후로 의미 있게 달라지는지 확인
