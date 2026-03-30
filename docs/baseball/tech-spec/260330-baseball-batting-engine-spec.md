---
title: 야구 시뮬레이터 — 타격 엔진 Tech Spec
date: 2026-03-30
prd: docs/baseball/prd/260330-baseball-batting-engine.md
status: draft
---

## 프로젝트 호환성 체크

| 항목 | 현황 | 적용 방향 |
|------|------|-----------|
| 아키텍처 | 기능별 `src/lib/{domain}/` 분리 | `src/lib/baseball/batting/` 신규 디렉토리 (투구 엔진과 대칭) |
| 런타임 | Next.js App Router | 엔진은 순수 TS — Next.js 의존 없음 |
| DB | Supabase | 엔진 레이어에서 DB 접근 없음 |
| 테스트 | 없음 | 해당 없음 |
| 타입 | `src/lib/baseball/engine/` 기존 | `PitchResult`, `ZoneType`, `FamiliarityMap` 재사용 |

---

## 의존성 분석

### 신규 파일 (모두 `src/lib/baseball/batting/` 하위)

| 파일 | 역할 |
|------|------|
| `types.ts` | `BattingState`, `BattingResult`, `AtBatResult` 타입 |
| `config.ts` | 밸런싱 파라미터 집중 관리 |
| `bunt-stub.ts` | M2 번트 결정 stub |
| `swing-decision.ts` | M3 스윙 여부 판정 |
| `contact.ts` | M4 컨택 판정 (헛스윙/파울/페어) |
| `batted-ball.ts` | M6 페어 컨택 품질 (exit_velocity, launch_angle) |
| `hit-result.ts` | M7 타구 결과 판정 (HR/3B/2B/1B/out) |
| `count.ts` | M8/M9 볼카운트 업데이트 + 삼진/볼넷/사구 처리 |
| `hit-ball.ts` | `hitBall()` 통합 함수 |

### 기존 파일 변경

| 파일 | 변경 내용 |
|------|----------|
| `src/lib/baseball/engine/types.ts` | 변경 없음 — `PitchResult`, `ZoneType`, `FamiliarityMap` import |
| `src/lib/baseball/types/player.ts` | 변경 없음 — `Player` import |

### DB 변경
없음. 엔진은 인메모리 순수 함수.

---

## 타입 설계 (`types.ts`)

```typescript
import type { Player } from '../types/player'
import type { FamiliarityMap, ZoneType } from '../engine/types'

export type AtBatResult =
  | 'in_progress'   // 타석 진행 중 (볼/스트라이크 추가됨)
  | 'strikeout'     // 삼진
  | 'walk'          // 볼넷
  | 'hit_by_pitch'  // 사구
  | 'single'        // 1루타
  | 'double'        // 2루타
  | 'triple'        // 3루타
  | 'home_run'      // 홈런
  | 'out'           // 인플레이 아웃

// hitBall()에 넘기는 타자 측 상태
export interface BattingState {
  batter: Player
  count: { balls: number; strikes: number }
  outs: number
  runners: { first: boolean; second: boolean; third: boolean }
  familiarity: FamiliarityMap   // throwPitch()가 반환한 next_familiarity
  inning: number
}

// hitBall() 반환값
// null 필드: 해당 분기에 도달하지 않은 경우 (예: take 시 exit_velocity = null)
export interface BattingResult {
  swing: boolean                    // 스윙 여부
  contact: boolean | null           // 컨택 여부 (스윙 시만 유효)
  is_foul: boolean | null           // 파울 여부 (컨택 시만 유효)
  exit_velocity: number | null      // 타구 속도 km/h (페어 컨택 시만)
  launch_angle: number | null       // 발사각 ° (페어 컨택 시만)
  at_bat_result: AtBatResult
  next_count: { balls: number; strikes: number }
  at_bat_over: boolean              // 타석 종료 여부 (호출 측 타석 루프 제어용)
}
```

---

## 파라미터 설계 (`config.ts`)

```typescript
import type { ZoneType } from '../engine/types'

export const SWING_CONFIG = {
  base_swing: {
    core:  0.85,
    edge:  0.65,
    chase: 0.35,
    ball:  0.10,
    dirt:  0.20,
  } satisfies Record<ZoneType, number>,
  count_modifier: {
    '0-2': +0.10,   // 타자 수세 → 공격적 스윙
    '3-0': -0.15,   // 볼카운트 유리 → 소극적
    '3-2': +0.05,
  } as Record<string, number>,
  eye_default: 50,  // Eye 스탯 미구현 시 기본값 (modifier = 0)
}

export const CONTACT_CONFIG = {
  // base_contact = intercept + (Contact/100) × slope
  base_contact: {
    core:  { intercept: 0.55, slope: 0.40 },  // 0.55 ~ 0.95
    edge:  { intercept: 0.35, slope: 0.35 },  // 0.35 ~ 0.70
    chase: { intercept: 0.15, slope: 0.25 },  // 0.15 ~ 0.40
    ball:  { intercept: 0.05, slope: 0.15 },  // 0.05 ~ 0.20
    dirt:  { intercept: 0.10, slope: 0.15 },  // 0.10 ~ 0.25
  } satisfies Record<ZoneType, { intercept: number; slope: number }>,
  pitch_modifier_max: 0.30,      // 구종 난이도 최대 페널티 -30%
  familiarity_bonus_max: 0.15,   // familiarity 최대 보너스 +15%
  // 컨택 성공 시 페어 확률
  fair_prob: {
    core:  0.75,
    edge:  0.55,
    chase: 0.35,
    ball:  0.15,
    dirt:  0.20,
  } satisfies Record<ZoneType, number>,
}

// exit_velocity 구간 (km/h)
export type EVTier = 'soft' | 'medium' | 'hard' | 'very_hard'
// launch_angle 구간 (°)
export type LATier = 'ground' | 'line_drive' | 'fly' | 'popup'

export const BATTED_BALL_CONFIG = {
  base_exit_velocity: 130,        // km/h 기준
  power_slope: 0.60,              // exit_velocity = 130 × (0.70 + Power/100 × 0.60)
  quality_std_base: 0.08,         // σ = 0.08 × (1 - Contact/200)
  launch_angle_base: {
    high_zone: 5,                 // 높은 존 → 낮은 발사각 (땅볼성)
    mid_zone:  20,
    low_zone:  35,                // 낮은 존 → 높은 발사각 (플라이)
  },
  launch_noise_base: 12,          // ° — Contact 높을수록 감소
  ev_tiers: { soft: 120, medium: 140, hard: 155 },  // 이하: soft / 이하: medium / 이하: hard / 초과: very_hard
  la_tiers: { ground: 10, line_drive: 25, fly: 45 }, // 이하: ground / ... / 초과: popup
}

// EV 구간 × LA 구간 → 타구 결과 가중치 테이블
// [home_run, triple, double, single, out]
export const HIT_RESULT_TABLE: Record<EVTier, Record<LATier, number[]>> = {
  soft: {
    ground:     [0,    0,    0,    0.10, 0.90],
    line_drive: [0,    0,    0,    0.30, 0.70],
    fly:        [0,    0,    0,    0.20, 0.80],
    popup:      [0,    0,    0,    0,    1.00],
  },
  medium: {
    ground:     [0,    0,    0,    0.25, 0.75],
    line_drive: [0,    0,    0.30, 0.50, 0.20],
    fly:        [0,    0,    0.40, 0.20, 0.40],
    popup:      [0,    0,    0,    0,    1.00],
  },
  hard: {
    ground:     [0,    0,    0,    0.40, 0.60],
    line_drive: [0,    0.10, 0.50, 0.30, 0.10],
    fly:        [0.30, 0.10, 0.40, 0.10, 0.10],
    popup:      [0,    0,    0,    0,    1.00],
  },
  very_hard: {
    ground:     [0,    0,    0,    0.30, 0.70],
    line_drive: [0,    0.20, 0.40, 0.30, 0.10],
    fly:        [0.70, 0.05, 0.15, 0.05, 0.05],
    popup:      [0,    0,    0,    0.10, 0.90],
  },
}
```

---

## 함수별 설계

### `bunt-stub.ts`
```typescript
export function decideBunt(
  _batter: Player,
  _count: BattingState['count'],
  _runners: BattingState['runners'],
  _situation: Pick<BattingState, 'outs' | 'inning'>
): { attempt: false } {
  return { attempt: false }
}
```

### `swing-decision.ts`
```typescript
export function decideSwing(
  batter: Player,
  zoneType: ZoneType,
  count: BattingState['count']
): boolean
```
- `eye_modifier = (eye - 50) / 200` (eye = SWING_CONFIG.eye_default = 50 → modifier 0)
- `count_key = '${balls}-${strikes}'`
- `p_swing = base_swing[zoneType] + count_modifier[count_key] ?? 0 + eye_modifier`
- `clamp(p_swing, 0, 1)` 후 `Math.random() < p_swing`

### `contact.ts`
```typescript
export function resolveContact(
  zoneType: ZoneType,
  pitchResult: PitchResult,
  batter: Player,
  familiarity: FamiliarityMap
): { contact: boolean; is_fair: boolean | null }
```
- `pitch_modifier = 1.0 - (구위 + 구속 + 변화) / 300 × pitch_modifier_max`
- `fam_val = familiarity[pitchResult.pitch_type]?.[String(pitchResult.actual_zone)] ?? 0`
- `familiarity_bonus = 1.0 + fam_val × familiarity_bonus_max`
- 컨택 실패 시 `is_fair = null`, 성공 시 `is_fair = Math.random() < fair_prob[zoneType]`

### `batted-ball.ts`
```typescript
export function calcBattedBall(
  zoneType: ZoneType,
  batter: Player
): { exit_velocity: number; launch_angle: number }
```
- `power_factor = 0.70 + (batter.stats.power / 100) × power_slope`
- `σ = quality_std_base × (1 - batter.stats.contact / 200)`
- `quality_roll = gaussianRandom(1.0, σ)`  ← Box-Muller
- `exit_velocity = base_exit_velocity × power_factor × quality_roll`
- `zone_height`: `zone_type`이 high(1/2/3) → `high_zone`, mid(4/5/6) → `mid_zone`, low(7/8/9) → `low_zone`
- `noise = gaussianRandom(0, launch_noise_base × (1 - batter.stats.contact / 200))`
- `launch_angle = zone_base + noise`

### `hit-result.ts`
```typescript
export function resolveHitResult(
  exit_velocity: number,
  launch_angle: number
): Exclude<AtBatResult, 'in_progress' | 'strikeout' | 'walk' | 'hit_by_pitch'>
```
- EV → `EVTier`, LA → `LATier` 분류
- `HIT_RESULT_TABLE[ev_tier][la_tier]` 가중치로 `weightedRandom` 선택

### `count.ts`
```typescript
export function applyPitchToCount(
  current: BattingState['count'],
  event: 'strike' | 'ball' | 'foul',
  is_hbp: boolean
): Pick<BattingResult, 'next_count' | 'at_bat_over' | 'at_bat_result'>
```
- strike: strikes + 1 → 3이면 `strikeout`, `at_bat_over: true`
- ball: balls + 1 → 4이면 `walk`, `at_bat_over: true`
- foul: strikes < 2이면 strikes + 1, 2이면 유지
- is_hbp: `hit_by_pitch`, `at_bat_over: true`

### `hit-ball.ts`
```typescript
export function hitBall(state: BattingState, pitch: PitchResult): BattingResult {
  // 0. HBP early return
  if (pitch.is_hbp) { ... }

  // 1. 번트 결정 (stub)
  const bunt = decideBunt(...)
  if (bunt.attempt) { return undefined as never }

  // 2. 스윙 여부
  const swing = decideSwing(batter, pitch.zone_type, count)
  if (!swing) {
    // take → 볼/스트라이크
    const event = pitch.is_strike ? 'strike' : 'ball'
    return { swing: false, contact: null, is_foul: null,
             exit_velocity: null, launch_angle: null,
             ...applyPitchToCount(count, event, false) }
  }

  // 3. 컨택 판정
  const { contact, is_fair } = resolveContact(...)
  if (!contact) {
    // 헛스윙
    return { swing: true, contact: false, is_foul: null,
             exit_velocity: null, launch_angle: null,
             ...applyPitchToCount(count, 'strike', false) }
  }

  // 4. 파울
  if (!is_fair) {
    return { swing: true, contact: true, is_foul: true,
             exit_velocity: null, launch_angle: null,
             ...applyPitchToCount(count, 'foul', false) }
  }

  // 5. 페어 컨택 품질
  const { exit_velocity, launch_angle } = calcBattedBall(pitch.zone_type, batter)

  // 6. 타구 결과
  const hit_type = resolveHitResult(exit_velocity, launch_angle)

  return { swing: true, contact: true, is_foul: false,
           exit_velocity, launch_angle,
           at_bat_result: hit_type, next_count: count,
           at_bat_over: true }
}
```

---

## Plan (Implementation Checklist)

**Step 1: 타입 + 파라미터**
- [ ] `src/lib/baseball/batting/types.ts`
- [ ] `src/lib/baseball/batting/config.ts`

**Step 2: 개별 함수 구현** ← Step 1 완료 후
- [ ] `bunt-stub.ts` — `decideBunt`
- [ ] `swing-decision.ts` — `decideSwing`
- [ ] `contact.ts` — `resolveContact`
- [ ] `batted-ball.ts` — `calcBattedBall` (Box-Muller 포함)
- [ ] `hit-result.ts` — `resolveHitResult`
- [ ] `count.ts` — `applyPitchToCount`

**Step 3: 통합 함수** ← Step 2 완료 후
- [ ] `hit-ball.ts` — `hitBall`

**Step 4: 검증**
- [ ] `npx tsc --noEmit` 통과
- [ ] `throwPitch → hitBall` 체인 100타석 시뮬레이션 스크립트
- [ ] K% 21~24%, BB% 7~10%, H/PA 20~24%, HR/페어컨택 3~6% 범위 확인

---

## Data Flow & Risk

### 데이터 흐름

```
[게임 루프 (다음 피처)]
  BattingState 조립 (batter, count, familiarity ← throwPitch 결과)
  → hitBall(state, pitchResult) 호출
  → BattingResult 수신
  → at_bat_over: true → 타석 종료 처리 (주자 이동 등)
  → at_bat_over: false → 다음 throwPitch 호출 (다음 투구)
```

### Risk & Rollback

| # | 위험 | 경감 | 롤백 |
|---|------|------|------|
| R1 | 삼진율/안타율 범위 이탈 | HIT_RESULT_TABLE 가중치 조정 | config.ts 수정만으로 대응 |
| R2 | 스윙 확률 편향 | SWING_CONFIG 파라미터 조정 | config.ts 수정 |
| R3 | launch_angle noise 과도 | launch_noise_base 조정 | config.ts 수정 |
| R4 | 투구 엔진 타입 의존 변경 | `PitchResult` 인터페이스 먼저 확정 (완료) | types.ts 수정 |
