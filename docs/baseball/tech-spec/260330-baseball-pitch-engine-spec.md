---
title: 야구 시뮬레이터 — 투구 엔진 Tech Spec
date: 2026-03-30
prd: docs/baseball/prd/260330-baseball-pitch-engine.md
status: draft
---

## 프로젝트 호환성 체크

| 항목 | 현황 | 적용 방향 |
|------|------|-----------|
| 아키텍처 | 기능별 `src/lib/{domain}/` 분리 | `src/lib/baseball/engine/` 신규 디렉토리 |
| 런타임 | Next.js App Router | 엔진은 순수 TS — Next.js 의존 없음 |
| DB | Supabase | 엔진 레이어에서 DB 접근 없음, 선수 데이터는 호출 측이 주입 |
| 테스트 | 없음 | 해당 없음 |
| 타입 | `src/lib/baseball/types/player.ts` 기존 | `Player`, `PitchTypeData`, `PlayerStats` 재사용 |

---

## 의존성 분석

### 신규 파일 (모두 `src/lib/baseball/engine/` 하위)

| 파일 | 역할 |
|------|------|
| `types.ts` | 엔진 입출력 타입 (`GamePitchState`, `PitchResult` 등) |
| `config.ts` | 밸런싱 파라미터 집중 관리 |
| `pitch-select.ts` | M2 구종 선택 |
| `pickoff-stub.ts` | M3 견제 결정 stub |
| `zone-select.ts` | M4 코스 선택 |
| `control-scatter.ts` | M5 제구 오차 + HBP 판정 |
| `zone-classify.ts` | M6 ABS 존 판정 |
| `stamina.ts` | M7 스태미나 소모 + 강판 체크 |
| `familiarity.ts` | M8 익숙함 추적·감쇠 |
| `throw-pitch.ts` | M9 `throwPitch()` 통합 함수 |

### 기존 파일 변경

| 파일 | 변경 내용 |
|------|----------|
| `src/lib/baseball/types/player.ts` | 변경 없음 — `Player`, `PitchTypeData` 그대로 import |

### DB 변경
없음. 엔진은 인메모리 순수 함수.

---

## 타입 설계 (`types.ts`)

```typescript
import type { PitchType, Player, PitchTypeData } from '../types/player'

// 존 분류 (타격 엔진이 스윙 확률 계산에 사용)
export type ZoneType = 'core' | 'edge' | 'chase' | 'ball' | 'dirt'

// 5×5 그리드 존 ID (Section 10-1)
// 1~9: 스트라이크 존, B11~B35: 볼 존
export type ZoneId =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  | 'B11' | 'B12' | 'B13' | 'B14' | 'B15'
  | 'B21' | 'B22' | 'B23' | 'B24' | 'B25' | 'B26'
  | 'B31' | 'B32' | 'B33' | 'B34' | 'B35'

// 구종별 익숙함 맵 (타석 단위로 누적)
export type FamiliarityMap = Partial<Record<PitchType, Partial<Record<ZoneId, number>>>>

// throwPitch()에 넘기는 전체 상태
export interface GamePitchState {
  pitcher: Player
  batter: Player
  count: { balls: number; strikes: number }
  outs: number
  runners: { first: boolean; second: boolean; third: boolean }
  recent_pitches: Array<{ type: PitchType; zone: ZoneId }>  // 최근 N구 이력
  remaining_stamina: number                                   // 현재 스태미나
  familiarity: FamiliarityMap                                // 현재 타석 익숙함
  inning: number
  is_scoring_position: boolean                               // 득점권 주자 여부
}

// throwPitch() 반환값
export interface PitchResult {
  pitch_type: PitchType
  target_zone: ZoneId                  // 투수가 노린 존
  actual_x: number                     // 실제 도달 x 좌표 (m)
  actual_z: number                     // 실제 도달 z 좌표 (m)
  actual_zone: ZoneId                  // 실제 도달 존
  zone_type: ZoneType                  // core/edge/chase/ball/dirt
  is_strike: boolean
  is_hbp: boolean                      // 사구 여부
  delivery_time: number                // 홈까지 이동 시간 (s) — 타격·도루 시스템용
  needs_relief: boolean                // 강판 필요 여부
  next_stamina: number                 // 투구 후 스태미나 (호출 측이 상태 업데이트)
  next_familiarity: FamiliarityMap     // 투구 후 익숙함 (호출 측이 상태 업데이트)
}
```

---

## 파라미터 설계 (`config.ts`)

```typescript
export const PITCH_SELECT_CONFIG = {
  k:     0.6,   // 반복 패널티 강도
  N:     5,     // 반복 판단 윈도우 (최근 N구)
  boost: 1.5,   // 위기 상황 주무기 보정
}

export const STAMINA_CONFIG = {
  fatigue_per_pitch:   0.7,
  pitch_type_modifier: {
    fastball:   1.0,
    sinker:     1.0,
    cutter:     1.0,
    slider:     1.1,   // breaking
    curveball:  1.1,
    changeup:   0.9,   // off_speed
    splitter:   0.9,
    forkball:   0.9,
  } satisfies Record<PitchType, number>,
  relief_threshold: 0,
}

export const SCATTER_CONFIG = {
  base_radius:  0.20,  // 기본 오차 반경 (m) — 밸런싱 대상
  axis_ratio:   0.6,   // minor/major 축 비율
  fatigue_mult: 0.5,   // 스태미나 소진 시 오차 증가 배수
}

// 우타자 기준 몸통 영역 (좌타자는 x 부호 반전)
export const BATTER_BODY = {
  x_min: -0.90, x_max: -0.50,
  z_min:  0.20, z_max:  1.80,
  y_min: -0.10, y_max:  0.50,
}

export const FAMILIARITY_DECAY = 0.2   // 타석 종료 시 잔존율

// 구종×존 궁합 (pitch_affinity) — 선호 존은 가중치 2.0, 기본 1.0
export const PITCH_AFFINITY: Record<PitchType, Partial<Record<ZoneId, number>>> = {
  fastball:  { 1:2.0, 2:2.0, 3:2.0, B12:1.5, B13:1.5 },
  sinker:    { 7:2.0, 8:2.0, 9:2.0, B25:1.5, B31:1.5, B32:1.5 },
  cutter:    { 3:2.0, 6:2.0, 9:2.0, B22:1.5 },
  slider:    { 3:2.0, 6:2.0, 9:2.0, B22:1.5, B24:1.5, B26:1.5 },
  curveball: { 7:2.0, 8:2.0, 9:2.0, B33:1.5, B34:1.5, B35:1.5 },
  changeup:  { 7:2.0, 8:2.0, 9:2.0, B34:1.5 },
  splitter:  { 8:2.0, 9:2.0, B32:1.5, B33:1.5 },
  forkball:  { 8:2.0, 9:2.0, B33:1.5, B35:1.5 },
}

export const COUNT_MODIFIER = {
  behind_3balls:   { strike_zones: 1.8, ball_zones: 0.3 },
  ahead_0_2:       { natural_fall: 1.6, dirt: 1.4 },
  ahead_1_2:       { natural_fall: 1.6, dirt: 1.4 },
  first_pitch:     {},  // 보정 없음
}

export const SEQUENCE_MODIFIER = {
  prev_inside_to_outside: 1.4,
  prev_outside_to_inside: 1.4,
  prev_high_to_low:       1.3,
  prev_low_to_high:       1.3,
}
```

---

## 함수별 설계

### `pitch-select.ts`
```typescript
export function selectPitchType(
  pitcher: Player,
  recentPitches: GamePitchState['recent_pitches'],
  situation: Pick<GamePitchState, 'count' | 'is_scoring_position'>
): PitchType
```
- 기본 가중치: `pitchTypes` 각 항목의 `(ball_power + ball_break + ball_speed) / 전체 합`
- 반복 패널티: `1 / (1 + k × 최근 N구에서 해당 구종 수)`
- 위기 보정: `count.balls === 3 || is_scoring_position` → 가중치 최상위 구종 `×boost`
- `weightedRandom(weights)` 유틸로 확률적 선택

### `pickoff-stub.ts`
```typescript
export function decidePickoff(
  _pitcher: Player,
  _runners: GamePitchState['runners'],
  _situation: Pick<GamePitchState, 'count' | 'inning'>
): { attempt: false } {
  return { attempt: false }
}
```

### `zone-select.ts`
```typescript
export function selectTargetZone(
  pitcher: Player,
  pitchType: PitchType,
  count: GamePitchState['count'],
  recentPitches: GamePitchState['recent_pitches']
): { zone: ZoneId; delivery_time: number }
```
- `zone_weight[z] = affinity(z) × countMod(z) × seqMod(z)`
- `delivery_time = BASE_DISTANCE / (pitch.ball_speed / 100 × MAX_SPEED)`
  - `BASE_DISTANCE = 18.44m` (투수판→홈), `MAX_SPEED = 50m/s` (180km/h 기준)

### `control-scatter.ts`
```typescript
export function applyControlScatter(
  targetZone: ZoneId,
  pitchData: PitchTypeData,
  remainingStamina: number,
  maxStamina: number,
  batter: Player
): { actual_x: number; actual_z: number; actual_zone: ZoneId; is_hbp: boolean }
```
- 타원 내 무작위 점 생성 → `actual_x`, `actual_z`
- HBP 판정: `BATTER_BODY` 범위 체크 (좌타자 x 반전)
- `actual_zone`: `actual_x`, `actual_z`로 `classifyZoneId()` 역산

### `zone-classify.ts`
```typescript
export function classifyZone(
  actual_x: number,
  actual_z: number,
  batter: Player
): { zone_id: ZoneId; zone_type: ZoneType; is_strike: boolean }
```
- expanded strike zone: `±25.25cm`, `(zone_bottom - 3.65cm) ~ (zone_top + 3.65cm)`
- 5×5 그리드 매핑으로 ZoneId 결정

### `stamina.ts`
```typescript
export function consumeStamina(
  currentStamina: number,
  pitchType: PitchType
): number  // next_stamina

export function checkRelief(stamina: number): boolean
```

### `familiarity.ts`
```typescript
export function updateFamiliarity(
  current: FamiliarityMap,
  pitchType: PitchType,
  zone: ZoneId
): FamiliarityMap  // 불변, 새 맵 반환

export function decayFamiliarity(current: FamiliarityMap): FamiliarityMap
// 타석 종료 시 호출 — 모든 값 × FAMILIARITY_DECAY
```

### `throw-pitch.ts`
```typescript
export function throwPitch(state: GamePitchState): PitchResult {
  // 1. 구종 선택
  const pitchType = selectPitchType(...)

  // 2. 견제 결정 (stub)
  // stub은 항상 { attempt: false }를 반환
  // 견제 피처 구현 시 decidePickoff를 교체하고, attempt === true 분기에서
  // PickoffResult를 반환하는 로직을 추가
  const pickoff = decidePickoff(...)
  if (pickoff.attempt) {
    // 견제 피처 구현 전까지 이 분기는 도달하지 않음
    // 도달 시 호출 측에서 처리 (현재는 undefined 반환으로 early exit)
    return undefined as never
  }

  // 3. 코스 선택 + delivery_time
  const { zone: targetZone, delivery_time } = selectTargetZone(...)

  // 4. 제구 오차 + HBP
  const { actual_x, actual_z, actual_zone, is_hbp } = applyControlScatter(...)

  // 5. ABS 존 판정
  const { zone_type, is_strike } = classifyZone(...)

  // 6. 스태미나 소모
  const next_stamina = consumeStamina(state.remaining_stamina, pitchType)
  const needs_relief = checkRelief(next_stamina)

  // 7. 익숙함 업데이트
  const next_familiarity = updateFamiliarity(state.familiarity, pitchType, actual_zone)

  return { pitch_type, target_zone, actual_x, actual_z, actual_zone,
           zone_type, is_strike, is_hbp, delivery_time,
           needs_relief, next_stamina, next_familiarity }
}
```

---

## Plan (Implementation Checklist)

**Step 1: 타입 + 파라미터**
- [ ] `src/lib/baseball/engine/types.ts`
- [ ] `src/lib/baseball/engine/config.ts`

**Step 2: 개별 함수 구현** ← Step 1 완료 후
- [ ] `pitch-select.ts` — `selectPitchType`
- [ ] `pickoff-stub.ts` — `decidePickoff`
- [ ] `zone-select.ts` — `selectTargetZone`
- [ ] `control-scatter.ts` — `applyControlScatter`
- [ ] `zone-classify.ts` — `classifyZone`
- [ ] `stamina.ts` — `consumeStamina`, `checkRelief`
- [ ] `familiarity.ts` — `updateFamiliarity`, `decayFamiliarity`

**Step 3: 통합 함수** ← Step 2 완료 후
- [ ] `throw-pitch.ts` — `throwPitch`

**Step 4: 검증**
- [ ] `npx tsc --noEmit` 통과
- [ ] `throwPitch` 직접 호출 스크립트로 100투구 시뮬레이션 — 구종 분포·존 분포 확인
- [ ] 스태미나 0 도달 시 `needs_relief: true` 확인
- [ ] 타석 종료 후 `decayFamiliarity` 호출 시 값이 20%로 감소 확인

---

## Data Flow & Risk

### 데이터 흐름

```
[게임 진행 측 (미구현)]
  선수 데이터 로드 (GET /api/baseball/teams)
  → GamePitchState 조립
  → throwPitch(state) 호출
  → PitchResult 수신
  → next_stamina, next_familiarity로 상태 업데이트
  → 타격 엔진으로 PitchResult 전달 (다음 피처)
```

### 테이블 Read/Write

| 테이블 | 역할 |
|--------|------|
| `baseball_players` | Read — 게임 시작 시 1회 로드, 이후 메모리 사용 |
| 그 외 | 없음 |

### Risk & Rollback

| # | 위험 | 경감 | 롤백 |
|---|------|------|------|
| R1 | 구종 선택 확률 편향 | config.ts 파라미터 조정 | 파라미터 변경만으로 대응 |
| R2 | 타격 엔진 경계 혼선 | PitchResult 인터페이스 먼저 확정 | types.ts 수정 |
| R3 | 순수 함수 오염 | DB/전역 상태 접근 금지, 모든 입력은 state로 | 해당 없음 (구조적 강제) |
| R4 | ZoneId 좌표 역산 복잡도 | classifyZone에서 5×5 그리드 룩업 테이블 사용 | 로직 단순화 |
