---
title: 야구 시뮬레이터 — 투구 엔진
date: 2026-03-30
owner: @uzifan
status: draft
---

## Context

야구 시뮬레이터의 한 투구(pitch) 사이클을 완성하는 엔진을 구현한다.
투구 엔진은 다음 피처(타격 엔진)의 입력값을 생성하는 역할을 한다.

**한 투구 사이클 흐름:**
```
[루프 시작]
  → 구종 선택 (Section 1)
  → 견제 결정 (stub — 견제 피처에서 구현 예정)
      ├─ 견제 수행 → 견제 피처로 위임 → [루프 시작으로 복귀]
      └─ 투구 진행
           → 코스 선택 (Section 10)
           → 제구 오차 적용 (Section 11)
           → ABS 스트라이크 존 판정 (Section 9)
           → 스태미나 소모 (Section 14)
           → 익숙함 업데이트 (Section 2)
           → PitchResult 반환 [루프 종료]
  → [타격 엔진으로 넘김]
```

> 견제를 수행하면 투수는 다시 구종 선택부터 시작한다.
> 견제 피처 구현 전까지 견제 결정 분기는 항상 "투구 진행"을 반환하는 stub으로 유지.

**기준 설계 문서**: `docs/baseball/design/pitch-batter-interaction.md`
- Section 1: 구종 선택 전략
- Section 2: 타자 구종 예측 및 익숙함 시스템 (추적 부분)
- Section 9: ABS 스트라이크 존 판정
- Section 10: 투수 코스 선택 전략
- Section 11: 제구 시스템 (BallControl, 오차 타원, HBP)
- Section 14: 투수 체력 소모 및 강판
- Section 15-3: 견제 (stub — 분기 구조만 포함, 로직은 견제 피처에서)

**경계:**
- 이 피처는 투구 생성까지만 담당 — 타자 스윙/컨택(Section 7)은 다음 피처(타격 엔진)
- 볼카운트 관리는 타격 엔진 담당 (스윙·파울 여부를 알아야 완결되기 때문)
- 견제 실제 로직(주자 반응, 아웃/세이프 판정)은 견제 피처 담당
- 주자 이동, 수비, 득점 판정은 별도 피처

---

## Goals / Non-Goals

**Goals:**
- 투수 AI가 구종·코스를 선택하는 로직을 구현한다 (Section 1, 10).
- 제구 오차 모델로 실제 도달 위치를 계산한다 (Section 11).
- ABS 스트라이크 존 기반으로 스트라이크/볼을 판정한다 (Section 9).
- 볼카운트(B-S)를 관리하고 볼넷·삼진 타석 종료 조건을 처리한다 (Section 9).
- 투구마다 스태미나를 소모하고 강판 조건을 체크한다 (Section 14).
- 타격 엔진이 읽을 `PitchResult` 인터페이스를 정의한다.
- 익숙함(familiarity) 상태를 타석·경기 단위로 추적·감쇠한다 (Section 2).

**Non-Goals:**
- 타자 스윙 여부, 컨택 판정 — 타격 엔진 피처
- 타구 물리 시뮬레이션 — 타격 엔진 피처
- 낫아웃(Section 8) — 타격 엔진 피처
- 도루 중 투구 처리 — 도루 피처
- 사용자 인터랙션(감독 모드) — 별도 UI 피처
- 수비 포지셔닝, 포구 판정 — 수비 피처

---

## Success Definition

- `throwPitch(state)` 함수 1회 호출로 한 투구 사이클이 완결된다.
- 반환값 `PitchResult`에 `actual_x`, `actual_z`, `zone_type`, `pitch_type`, `delivery_time`, `is_strike`, `is_hbp`가 포함된다.
- 볼카운트 업데이트와 타석 종료 판정은 타격 엔진이 담당한다 (책임 분리).
- 투구마다 `remaining_stamina`가 감소하고 강판 기준 이하에서 `needs_relief: true`가 반환된다.
- 제구 악화: 스태미나 0% 기준 오차 반경이 1.5배가 된다.
- 익숙함이 타석 내에서 누적되고, 타석 종료 시 20%로 감쇠된다.
- 모든 로직은 `src/lib/baseball/engine/` 아래 순수 함수로 구현되어 Next.js 없이 독립 실행 가능하다.

> **참고**: UI 없는 순수 엔진 피처 — Phase 3 (HTML 목업) 스킵.

---

## Requirements

**Must-have:**

**M1. 타입 정의**
- [ ] `src/lib/baseball/engine/types.ts` — 엔진 내부 타입 정의
  - `ZoneType`: `'core' | 'edge' | 'chase' | 'ball' | 'dirt'`
  - `PitchResult`: `{ pitch_type, actual_x, actual_z, zone_type, is_strike, is_hbp, delivery_time, needs_relief, next_stamina, next_familiarity }`
    - `count_after` / `at_bat_over` 제외 — 볼카운트 관리는 타격 엔진 담당
    - `delivery_time`: 투구 홈까지 이동 시간 — 타격 엔진(속임 모델) + 도루 시스템에서 사용
    - `next_stamina` / `next_familiarity`: 투구 후 변경된 상태값을 반환 — 호출 측이 상태를 직접 관리 (순수 함수 보장)
  - `GamePitchState`: 엔진 입력 (투수/타자 스탯, 현재 카운트, 주자 상황, 최근 투구 이력, 현재 스태미나, 익숙함 맵)

**M2. 구종 선택 (Section 1)**
- [ ] `selectPitchType(pitcher, recentPitches, situation)` — 가중치 기반 확률적 선택
  - 기본 가중치: 구위+구속+변화 합 비례
  - 반복 패널티: `1 / (1 + k × 최근 N구 사용 횟수)`
  - 위기 상황 보정: 풀카운트·득점권 → 주무기 ×boost
  - 파라미터: `k=0.6, N=5, boost=1.5`

**M3. 견제 결정 (stub)**
- [ ] `decidePickoff(pitcher, runners, situation)` → `{ attempt: boolean }`
  - 견제 피처 구현 전까지 항상 `{ attempt: false }` 반환
  - `throwPitch` 루프 내에서 구종 선택 직후, 코스 선택 전에 호출
  - 인터페이스만 확정 — 실제 로직은 견제 피처에서 이 함수를 교체

**M4. 코스 선택 (Section 10)**
- [ ] `selectTargetZone(pitcher, pitchType, count, recentZones)` — 가중치 기반 확률적 선택
  - pitch_affinity: 구종×존 궁합 테이블
  - count_modifier: 3볼 → 스트라이크 존 강조, 유리한 카운트 → 유인구
  - sequence_modifier: 이전 코스 반대 방향 선호
  - `delivery_time` 계산: `BallSpeed` 기반 홈까지 이동 시간 — 타격 엔진(속임 모델)·도루 시스템 모두 사용
  - 속임 모델(Deception, Section 10-6): `P(커밋) = BallSpeed / 200 × (1 - familiarity × 0.3)`

**M5. 제구 오차 (Section 11)**
- [ ] `applyControlScatter(targetZone, ballControl, remainingStamina)` → `{ actual_x, actual_z }`
  - 오차 타원: `scatter_radius = base_radius × (1 - BallControl / 200)`
  - 스태미나 악화: `scatter_radius_effective = scatter_radius × (1 + fatigue_ratio × 0.5)`
  - HBP 판정: actual 좌표가 batter_body 범위 내이면 `is_hbp: true`

**M6. ABS 스트라이크 존 판정 (Section 9)**
- [ ] `classifyZone(actual_x, actual_z, batter)` → `ZoneType` + `is_strike`
  - 타자 `zone_bottom / zone_top` 기반 존 경계 계산
  - 공 반지름(3.65cm) 포함 expanded strike zone
  - 존 타입 분류: `core / edge / chase / ball / dirt`

> **볼카운트 관리(updateCount)는 타격 엔진 피처 담당** — 스윙·파울 여부를 알아야 완결되기 때문. `throwPitch`는 공의 도달 위치·판정까지만 반환하고, 카운트 업데이트는 타격 엔진이 호출한다.

**M7. 스태미나 소모 + 강판 체크 (Section 14)**
- [ ] `consumeStamina(pitcher, pitchType)` → `remaining_stamina`
  - `fatigue_per_pitch × pitch_type_modifier[pitchType]`
  - `STAMINA_CONFIG`: `fatigue_per_pitch=0.7, breaking=×1.1, off_speed=×0.9`
- [ ] `checkRelief(pitcher)` → `needs_relief: boolean`
  - `remaining_stamina <= relief_threshold(0)` → true

**M8. 익숙함 추적 (Section 2)**
- [ ] `updateFamiliarity(state, pitchType, zone)` → 업데이트된 familiarity 맵
  - 타석 내 누적
  - 타석 종료 시 `×decay_rate(0.2)` 감쇠
  - 경기 종료 시 완전 초기화

**M9. throwPitch 통합 함수**
- [ ] `throwPitch(state: GamePitchState): PitchResult`
  - M2~M7을 순서대로 호출하는 통합 진입점
  - 순수 함수 (사이드 이펙트 없음, state는 불변)

---

**M10. 파라미터 설정 파일**
- [ ] `src/lib/baseball/engine/config.ts` — 모든 밸런싱 파라미터를 한 곳에서 관리
  - `PITCH_SELECT_CONFIG`: `{ k, N, boost }`
  - `STAMINA_CONFIG`: `{ fatigue_per_pitch, pitch_type_modifier, relief_threshold }`
  - `PITCH_AFFINITY`: 구종×존 궁합 테이블
  - `COUNT_MODIFIER`, `SEQUENCE_MODIFIER`: 볼카운트/배구 순서 보정값
  - `SCATTER_CONFIG`: `{ base_radius, axis_ratio }`
  - `BATTER_BODY`: 사구 판정 몸통 영역 좌표

---

**Nice-to-have:**

**N1. 투구 시퀀스 로그**
- [ ] `throwPitch` 반환값에 `debug_log` 옵션 추가 — 각 선택 단계의 가중치 스냅샷 포함

---

## Risks

**R1. 파라미터 밸런싱**
- 구종 선택 확률이 너무 편향되거나 너무 랜덤하면 야구답지 않은 결과 발생
- 대응: 파라미터를 `config.ts`에 집중 관리, 초기값은 설계 문서 그대로 사용 후 시뮬레이션 결과 보고 조정

**R2. 타석 종료 경계**
- 볼카운트 업데이트 순서(스윙 여부 → 파울 → 존 판정)가 타격 엔진과 맞닿는 경계에서 혼선 가능
- 대응: `PitchResult`에 타격 엔진이 필요한 모든 값을 명시적으로 포함, 인터페이스를 먼저 확정 후 각각 구현

**R3. 순수 함수 유지**
- 엔진 함수에 전역 상태나 DB 접근이 혼입되면 테스트와 재사용이 어려워짐
- 대응: 모든 함수가 `GamePitchState`를 입력받고 `PitchResult`만 반환, 외부 의존성 없음

---

## UX Acceptance Criteria

<!-- UI 없는 순수 엔진 피처 — 해당 없음 -->

## User Flows

<!-- UI 없는 순수 엔진 피처 — 해당 없음 -->

## Plan

**Step 1: 타입 + 파라미터**
- [ ] `src/lib/baseball/engine/types.ts` — GamePitchState, PitchResult, ZoneType, ZoneId, FamiliarityMap
- [ ] `src/lib/baseball/engine/config.ts` — PITCH_SELECT_CONFIG, STAMINA_CONFIG, SCATTER_CONFIG, PITCH_AFFINITY, COUNT_MODIFIER, SEQUENCE_MODIFIER, BATTER_BODY, FAMILIARITY_DECAY

**Step 2: 개별 함수** ← Step 1 완료 후
- [ ] `pitch-select.ts` — `selectPitchType`
- [ ] `pickoff-stub.ts` — `decidePickoff` (항상 `{ attempt: false }`)
- [ ] `zone-select.ts` — `selectTargetZone` + `delivery_time` 계산
- [ ] `control-scatter.ts` — `applyControlScatter` + HBP 판정
- [ ] `zone-classify.ts` — `classifyZone` (ZoneId + ZoneType + is_strike)
- [ ] `stamina.ts` — `consumeStamina`, `checkRelief`
- [ ] `familiarity.ts` — `updateFamiliarity`, `decayFamiliarity`

**Step 3: 통합 함수** ← Step 2 완료 후
- [ ] `throw-pitch.ts` — `throwPitch(state): PitchResult`

**Step 4: 검증**
- [ ] `npx tsc --noEmit` 통과
- [ ] 검증 스크립트 (`scripts/test-pitch-engine.mjs`) 100투구 시뮬레이션
  - 구종 분포가 weight와 대략 일치하는지 확인
  - 스태미나 소진 후 `needs_relief: true` 확인
  - `decayFamiliarity` 호출 후 값이 20%로 감소 확인
  - HBP: 제구 낮은 투수가 몸쪽 코스 노릴 때 사구 발생 확인

## Data Flow & Risk

### 데이터 흐름

```
[게임 진행 측 (미구현)]
  선수 데이터 로드 (GET /api/baseball/teams)
    → GamePitchState 조립
    → throwPitch(state) 호출
        → PitchResult 반환
    → next_stamina / next_familiarity로 상태 업데이트
    → PitchResult를 타격 엔진으로 전달 (다음 피처)
```

### 테이블 명세

| 테이블 | Read | Write |
|--------|------|-------|
| `baseball_players` | 게임 시작 시 1회 로드 | 없음 |
| 그 외 | 없음 | 없음 |

### Risk & Rollback

| # | 위험 | 경감 | 롤백 |
|---|------|------|------|
| R1 | 구종 선택 편향 | config.ts 파라미터 조정 | 파라미터 값만 수정 |
| R2 | 타격 엔진 경계 혼선 | PitchResult 인터페이스 먼저 확정 | types.ts 수정 |
| R3 | 순수 함수 오염 | DB/전역 상태 접근 금지 | 구조적으로 강제됨 |
| R4 | ZoneId 좌표 역산 복잡도 | 5×5 그리드 룩업 테이블 사용 | 로직 단순화 |

---
---

# v2 — 투구 엔진 리워크 (2026-04-09)

> MVP 투구 엔진의 코스 선택(M4)과 제구 모델(M5)을 현실적으로 교체.
> 타격 엔진 v2, 수비 엔진 리워크 이후 캘리브레이션 과정에서 도출된 문제점 해결.

## 동기

1. **core 존 투구 비율 과다** (34%, MLB ~20-25%) → 타자가 초구에 치기 좋은 공을 받음 → 짧은 타석 → K% 하락
2. **chase 존 투구 부족** (5.3%, MLB ~15-20%) → 유인구/미끼구 부재 → 헛스윙 유도 부족
3. **제구 모델(scatter)이 비현실적** — 균일 타원 분포 + 하드 컷오프 → 제구 좋은 투수가 절대 실수 안 함
4. **ball/dirt 존이 의도적 목표에서 제외됨** → 변화구의 전략적 코스(B22 슬라이더, B33 스플리터) 미표현
5. **구종별 타자 착각(deception) 모델 부재** → "직구처럼 보이는 슬라이더" 같은 구종 속임 미구현

## 핵심 변경사항 (MVP 대비)

| MVP 요구사항 | v2 변경 |
|---|---|
| M4: `selectTargetZone` — 스트라이크 존 위주 선택 | → **25개 전 존을 의도적 목표로**, 구종별 전략적 ball/dirt 타겟팅 |
| M5: `applyControlScatter` — 균일 타원 분포 | → **가우시안 분포** (soft falloff, 하드 컷오프 없음) |
| PITCH_AFFINITY — 일부 chase에만 보너스 | → **구종별 ball/dirt 존에도 높은 가중치** |

## 변경 1: 구종별 전략적 코스 선택

### 25개 존 = 모두 의도된 목표

```
투수의 의도:
  fastball → 주로 존 1~9 (스트라이크 존)
  slider  → 존 3,6,9 (아웃코스 코너) + B22,B24,B26 (아웃코스 볼존)
  splitter → 존 8 (낮은 중앙) + B32,B33,B34 (dirt)
  curveball → 존 7,8,9 (낮은 존) + B33,B34 (dirt)

변화구가 ball/dirt 존을 노리는 것은 "실수"가 아니라 "전략".
```

### 구종별 PITCH_AFFINITY 확대

```typescript
// v2 — 구종별 ball/dirt 존 의도적 타겟팅
PITCH_AFFINITY = {
  fastball:  { 1: 2.0, 2: 2.0, 3: 2.0, B12: 1.3, B13: 1.3, B14: 1.3 },  // 높은 존 위주
  sinker:    { 7: 2.0, 8: 2.0, 9: 2.0, B32: 1.5, B33: 1.5 },             // 낮은 존 + dirt
  cutter:    { 3: 2.0, 6: 2.0, 9: 2.0, B22: 1.5, B24: 1.5 },             // 아웃코스
  slider:    { 3: 2.0, 6: 2.0, 9: 2.0, B22: 2.5, B24: 2.5, B26: 2.5 },   // 아웃코스 → 볼존 유인
  curveball: { 7: 2.0, 8: 2.0, 9: 2.0, B32: 2.0, B33: 2.5, B34: 2.0 },   // 낮은 dirt 유인
  changeup:  { 7: 1.5, 8: 2.0, 9: 1.5, B33: 2.0, B34: 1.5 },             // 낮은 존 + dirt
  splitter:  { 8: 2.0, 9: 1.5, B32: 2.0, B33: 2.5, B34: 2.0 },           // dirt 중심
  forkball:  { 8: 2.0, B32: 2.0, B33: 2.5, B34: 2.0 },                    // dirt 중심
}
```

### 구종별 타자 착각 (Deception) — 추후 구현

```
투수 의도: B22(아웃코스 볼존)에 슬라이더
타자 시점:
  릴리스 → "존 3(아웃코스 스트라이크) 향하는 직구처럼 보여"
  도달 직전 → 슬라이더 궤적 인식 → "아, 밖으로 빠지는 슬라이더구나"
  인식 성공(Eye 높음) → "참자" → 볼카운트
  인식 실패(Eye 낮음) → "스트라이크인 줄..." → 스윙 → 헛스윙

구현 방향:
  구종별 "출발 착각 존" 정의 (releaseLooksLike)
  readPitch에서 구종 인식 전 착각 존 기반으로 초기 판단
  구종 인식 성공 시 → 최종 존으로 수정
  구종 인식 실패 시 → 착각 존 유지 → 스윙 유도
```

> 착각 모델은 별도 기획 문서로 분리하여 구종별 상세 설계 예정.

## 변경 2: 가우시안 제구 모델

### 핵심 변경: 균일 타원 → 가우시안 분포

```
MVP:
  randomInEllipse(major, minor) → 타원 안에서 균일, 밖은 절대 불가
  Control 100 → 오차 0 (완벽)

v2:
  gaussianScatter(σ_x, σ_z) → 정규분포, 이론상 무한 범위
  Control 100 → σ 매우 작음, 극히 드문 큰 실수 가능
```

### σ 계산 공식

```
σ_base = f(BallControl)
  Control 100: σ = 0.06m (6cm) — 대부분 정확, 극히 드물게 18cm+ 실수
  Control 70:  σ = 0.15m (15cm) — 보통 제구
  Control 30:  σ = 0.30m (30cm) — 거의 랜덤

σ 공식 (선형):
  σ = σ_min + (1 - BallControl/100) × (σ_max - σ_min)
  σ_min = 0.06m (Control 100)
  σ_max = 0.30m (Control 0, 이론적 최저)

스태미나 피로 보정:
  σ_effective = σ × (1 + fatigue_mult × (1 - staminaRatio))
```

### 가우시안 특성

```
1σ 이내 (68% 투구):
  Control 100: 6cm 이내 (매우 정확)
  Control 70:  15cm 이내 (보통)
  Control 30:  30cm 이내 (넓게 퍼짐)

2σ 이내 (95% 투구):
  Control 100: 12cm 이내
  Control 70:  30cm 이내
  Control 30:  60cm 이내

3σ 이상 (0.3% = 극히 드문 실수):
  Control 100: 18cm+ (가끔 한복판으로 실투)
  Control 70:  45cm+ (존을 크게 벗어남)
  Control 30:  90cm+ (완전히 엉뚱한 곳)
```

### 구현 변경

```
변경 전 (control-scatter.ts):
  randomInEllipse(major, minor) → 균일 분포, 하드 컷오프

변경 후:
  gaussianRandom(0, σ_x) → x 방향 정규분포
  gaussianRandom(0, σ_z) → z 방향 정규분포
  → 모든 좌표에 도달 가능, 확률이 거리²에 비례해 급감
  → axis_ratio 유지 (σ_z = σ_x × axis_ratio, 수직이 더 넓음)
```

## 변경 3: 카운트별 코스 전략

### Phase 1 (이번 구현): 카운트 기반 가중치 보정

```
단순 규칙 기반:
  투수 유리(2S): chase/dirt ×보너스
  투수 불리(3B): edge 집중
  초구: edge 위주
```

### Phase 2 (필수 후속 과제): 목표 기반 투수 AI

> ⚠️ **Phase 1은 임시 구현.** Phase 2에서 반드시 교체해야 함.
> 같은 0-2라도 타자 특성, 투수 성향, 이전 패턴에 따라 다른 결정을 내려야 자연스러움.

```
Phase 2 설계 방향:

Step 1: 카운트 → "목표" 도출
  0-2 → "삼진 or 약한 컨택 유도"
  3-0 → "스트라이크 확보"
  0-0 → "탐색 (스트라이크 선점)"

Step 2: 목표 + 타자 분석 → 전략 선택
  "삼진" + 타자 chase 스윙율 높음 → "유인구"
  "삼진" + 타자 선구안 좋음 → "코너 승부"
  "스트라이크 확보" + 제구력 높음 → "edge"
  "스트라이크 확보" + 제구력 낮음 → "mid/core (안전)"

Step 3: 전략 → 존 가중치 동적 생성
  → 하드코딩 규칙이 아닌, 투수 AI 판단 결과
```

## 목표 투구 분포

| 존 | 현재 | v2 목표 | MLB 참고 |
|---|---|---|---|
| core (5) | 34% | 15~20% | ~15% |
| mid (2,4,6,8) | (core에 포함) | 10~15% | ~15% |
| edge (1,3,7,9) | 16% | 20~25% | ~20% |
| chase | 5% | 15~20% | ~20% |
| ball | 32% | 15~20% | ~15% |
| dirt | 13% | 10~15% | ~15% |

## 변경되는 파일

| 파일 | 변경 내용 |
|---|---|
| `engine/config.ts` | PITCH_AFFINITY 확대, SCATTER_CONFIG → 가우시안 σ 파라미터 |
| `engine/zone-select.ts` | ball/dirt 존 의도적 선택 허용, 카운트별 전략 강화 |
| `engine/control-scatter.ts` | `randomInEllipse` → 가우시안 분포, σ = f(BallControl) |

## 구현 순서

```
Phase 1 (이번):
  Step 1: PITCH_AFFINITY 확대 (구종별 ball/dirt 타겟팅)
  Step 2: control-scatter.ts → 가우시안 모델
  Step 3: zone-select.ts 카운트 가중치 보정 (임시)
  Step 4: 캘리브레이션 (K%, 투구/PA, 존 분포)

Phase 2 (필수 후속):
  Step 5: 목표 기반 투수 AI (카운트 하드코딩 → 상황 판단)
  Step 6: 구종별 전략 패턴 라이브러리 (아래 Phase 2 설계 참조)
  Step 7: 카운트 기반 전략 분기 (유리/중립/불리)
  Step 8: 타자 Power 기반 조심도 (그래프/함수 형태)
  Step 9: 구위 감소 트레이드오프 메커니즘
  Step 10: 구종별 착각(deception) 모델 기획 및 구현
  Step 11: 존 내 좌표 분포 (Phase 1에서 구현 or Phase 2로 이관)
```

---

## Phase 2 상세 설계 — 논의 정리 (2026-04-09~11)

### 1. 구종별 전략 패턴 라이브러리

각 구종은 "언제 어떤 의도로 어느 존에 던질지" 패턴을 보유:

```
fastball:
  기본 의도: 공격적 스트라이크 (mid/edge 위주)
  전략:
    - 이전 투구 반대 방향 (시퀀스 효과)
    - chase로 선구 혼란 (0-0, 0-1에서 가끔)
    - 높은 존으로 타이밍 뺏기

slider:
  기본 의도: 아웃코스 chase 유인구
  전략:
    - 불리 카운트 → offspeed-breaking 중간 속도로 존 안 (스트라이크 확보)
    - 백도어 (반대 방향에서 코너로 꺾여 들어옴, 좌타 대상)
    - 유인구 (우타 상대 B22/B24/B26)

curveball:
  기본 의도: 낮은 dirt 유인 (B33, B34)
  전략:
    - 높은 커브 → 낮은 커브 시퀀스
    - 눈높이 변화로 시각적 혼란

splitter/changeup:
  기본 의도: 낮은 dirt 유인 (B32/B33/B34)
  전략:
    - 타이밍 뺏기 용 존 안 (중속처럼 보임)
    - 패스트볼 연속 후 속임수

sinker:
  기본 의도: 낮은 존 + 인코스 (B25, B32)
  전략:
    - 땅볼 유도 (낮은 코스 집중)
    - 우타 상대 인코스 밀어붙이기
```

### 2. 카운트 기반 전략 분기

```
카운트 상태 분류:
  유리 (0-1, 0-2, 1-2):
    → 적극적, 스트라이크/볼 가리지 않음
    → 결정타 유인구 가능 (chase/dirt 적극)
    → 구종별 원하는 전략 자유 선택
    
  중립 (0-0, 1-0, 1-1, 2-2):
    → 탐색 위주 (edge/mid)
    → 시퀀스 구축 (이전 투구와 다른 방향)
    → 가벼운 유인구 섞기
    
  불리 (2-0, 3-0, 3-1, 2-1):
    → 스트라이크 존 안 우선
    → 유인구 쓰더라도 타이밍 뺏기 or 아슬아슬한 위치만
    → core/mid 선택 비중 증가 (안전)
    → 구위 감소 옵션 고려 (아래 참조)
    
  풀카운트 (3-2):
    → 스트라이크 우선이지만 edge 공략
    → 삼진 or 볼넷 결정 순간 → 신중
```

### 3. 타자 Power 기반 조심도 (그래프형)

```
캐리어(Carry) 수치: 타자 Power - 투수 BallPower
  양수 클수록 → 타자 우위 → 투수 조심도↑
  음수 클수록 → 투수 우위 → 공격적 투구

조심도 그래프 (예시):
  Power - BallPower ≤ -20: 조심도 0.0 (정상 투구)
  Power - BallPower = 0:   조심도 0.3 (약간 조심)
  Power - BallPower = +20: 조심도 0.7 (매우 조심)
  Power - BallPower ≥ +40: 조심도 1.0 (최대 조심)

조심도 적용:
  - 높은 존(row 0, 1) 회피율 증가
  - core/mid 존 선택 시 코너 쪽으로 밀어붙임
  - 낮은 존/dirt 선호 증가
  - 구위 감소 트레이드오프 사용 억제 (방어 수단 유지)
```

### 4. 구위 감소 트레이드오프 메커니즘

투수가 "구위를 희생하고 제구를 확보"하는 선택:

```
기본 모드: ball_power 100%, σ 100%
감소 모드: ball_power × 0.85, σ × 0.7

용도:
  - 불리 카운트에서 스트라이크 확보가 최우선일 때
  - "3-0 볼넷보다 3-0 안타가 나음" 판단
  - 구위를 줄여 노린 코너에 확실히 넣음

리스크:
  - 타자가 이를 치면 → 약한 공이라 강타 위험
  - 방어책: 타자 Power 높으면 사용 억제 (조심도와 연동)
  - 방어책: 코너 공략과 함께 사용 (위치로 방어)

사용 결정 알고리즘 (제안):
  if (카운트 === 불리) AND (타자 Power - BallPower < threshold):
    사용 확률 70%
  else:
    사용 확률 10~20% (상황별)
```

### 5. 구현 순서 (Phase 2)

```
a. 구종별 전략 패턴 설계 (DB/config 테이블)
b. 카운트 상태 분류 유틸
c. 투수 AI: 상황 → 의도 → 구종/존 선택
d. 타자 Power 조심도 계산
e. 구위 감소 트레이드오프 판단 로직
f. 시뮬레이션 + 캘리브레이션
```

### 6. 리스크 & 주의점

```
- 구종별 패턴 DB가 복잡해짐 → 밸런싱 비용 증가
- 투수 개성 표현은 스탯 + 구종 weight로 (개별 AI 페르소나 금지)
- "완벽한 판단" 지양 → 실수/반복 패턴 허용 (과최적화 방지)
- Phase 2 전체를 한 번에 구현하지 말고 a→b→c 순서로 점진 검증
```

## 성공 기준

| 지표 | 현재 | v2 목표 |
|---|---|---|
| K% | 18.3% | 20~24% |
| core 존 비율 | 34% | 15~20% |
| chase 존 비율 | 5% | 15~20% |
| 투구/PA | 3.2 | 3.5~3.9 |
| BB% | 7.9% (✅) | 유지 7.5~9.5% |
| BA/SLG/OPS | ✅ | 유지 |

## Risk

| # | 위험 | 경감 |
|---|------|------|
| R1 | 가우시안 σ가 너무 크면 BB% 폭등 | σ_max 캡 + 캘리브레이션 |
| R2 | ball/dirt 타겟팅으로 인플레이 아웃↓ | chase 비중으로 K% 보상 |
| R3 | 착각 모델 미구현 시 유인구 효과 제한 | 기존 readPitch 인식 오류로 대체 |
| R4 | 기존 타격/수비 캘리브레이션 깨짐 | v2 적용 후 전체 재캘리브레이션 |
