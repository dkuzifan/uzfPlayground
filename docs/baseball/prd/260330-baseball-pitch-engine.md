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
