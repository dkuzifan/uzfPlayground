---
title: 야구 시뮬레이터 — 타격 엔진 PRD
date: 2026-03-30
status: draft
---

# 야구 시뮬레이터 — 타격 엔진 (Batting Engine)

---

## Context

### 배경

투구 엔진(`throwPitch()`)이 완성되어 `PitchResult`를 반환한다.
타격 엔진은 이 투구 결과를 받아 **타자의 반응 → 타석 결과 → 타구 물리**까지를 처리하는 다음 단계 엔진이다.

투구 엔진과 동일한 설계 원칙을 따른다:
- **순수 함수**: DB 접근 없음, 모든 상태는 인자로 받고 결과로 반환
- **Next.js 무의존**: `src/lib/baseball/batting/` 하위 순수 TypeScript

### 입력/출력 관계

```
throwPitch(GamePitchState) → PitchResult
          ↓
hitBall(BattingState, PitchResult) → BattingResult
```

`BattingResult`는 게임 루프(다음 피처)가 받아 볼카운트·주자·아웃카운트를 업데이트한다.

### 설계 원칙 참고 문서

- `docs/baseball/design/pitch-batter-interaction.md` — Section 3, 6, 7, 8
- `src/lib/baseball/engine/types.ts` — `PitchResult`, `ZoneType` 재사용

---

## Goals / Non-Goals

### Goals (MVP)

- **G1**: 타자의 스윙 여부 확률적 결정 (선구안 — zone_type × count × eye 스탯)
- **G2**: 스윙 시 헛스윙/파울/페어 컨택 판정 (contact 확률 × familiarity 보정)
- **G3**: 페어 컨택 시 타구 품질 계산 (exit_velocity + launch_angle)
- **G4**: 타구 결과 판정 — 홈런 / 히트타입(1B·2B·3B) / 아웃 (단순 물리 모델)
- **G5**: 볼카운트 업데이트 포함 `BattingResult` 반환 (스트라이크·볼·삼진·사구·아웃·안타)
- **G6**: 모든 밸런싱 파라미터를 `batting/config.ts`에 집중

### Non-Goals (이번 피처에서 제외)

- 낫아웃(dropped third strike) — 포수 스탯 의존, 별도 피처로
- 수비 시뮬레이션 (포구·송구·주자 이동) — 수비 엔진 피처로
- 도루·번트 — 별도 피처로
- Eye 스탯 추가 — KBO BB% 기반 검토 후 추가 (현재 스탯 없음 → 50 고정)

---

## Success Definition

> 기준: MLB 2023~2025 리그 평균 실측치 (Baseball Reference)

| 지표 | 목표 범위 | MLB 3시즌 평균 |
|------|----------|--------------|
| `tsc --noEmit` 통과 | 타입 오류 0 | — |
| 삼진율 (K/PA) | **21~24%** | 22.5% |
| 볼넷율 (BB/PA) | **7~10%** | 8.4% |
| 안타율 (H/PA) | **20~24%** | 22.0% |
| 홈런 / 페어 컨택 | **3~6%** | 4.6% |
| 파울 처리 | 2스트라이크 이후 파울 = 볼카운트 유지 | — |
| 투구 엔진 연결 | `throwPitch` → `hitBall` 체인 호출 스크립트 통과 | — |

---

## Requirements

### Must-have

| # | 요구사항 | 설명 |
|---|---------|------|
| M1 | **타입 정의** | `BattingState` (볼카운트·타자·익숙함), `BattingResult` (타석 결과·다음 볼카운트) 타입 정의. `PitchResult`는 투구 엔진 타입 재사용 |
| M2 | **번트 결정 stub** | 스윙 판단 이전에 번트 여부를 결정하는 분기 위치 확보. 현재는 항상 `{ attempt: false }` 반환. 번트 피처 구현 시 교체 (투구 엔진의 `decidePickoff` stub과 동일 패턴) |
| M3 | **스윙 여부 판정** | 번트 미시도 시 진입. `P(swing) = base_swing[zone_type] × count_modifier × eye_modifier`. Eye 스탯 미구현 시 50 고정 (eye_modifier = 0) |
| M4 | **컨택 판정** | 스윙 시 헛스윙/컨택 분기. `contact_prob = base_contact[zone_type] × pitch_modifier × familiarity_bonus` |
| M5 | **파울/페어 분기** | 컨택 성공 시 파울/페어 확률 분기. 파울: 볼카운트 스트라이크 +1 (2스트라이크 이후엔 유지). 페어: M6으로 진행 |
| M6 | **페어 컨택 품질** | `exit_velocity`, `launch_angle` 계산. `exit_velocity = 130 × power_factor × quality_roll`, 발사각은 존별 기본값 + noise |
| M7 | **타구 결과 판정** | 발사각·타구 속도 기반 확률 모델로 홈런/3루타/2루타/1루타/인플레이아웃 결정. 수비 엔진 없이 동작하는 단순 모델 (수비 엔진 구현 시 교체 가능한 인터페이스 확보) |
| M8 | **볼카운트 업데이트** | 스트라이크/볼/삼진/사구/파울 각각에 대해 `next_count` 계산하여 `BattingResult`에 포함. 실제 상태 갱신은 호출 측(게임 루프) 담당 |
| M9 | **삼진/사구/HBP 처리** | 3스트라이크 → 삼진(`at_bat_result: 'strikeout'`). 4볼 → 볼넷(`'walk'`). `is_hbp: true` → 사구(`'hit_by_pitch'`) |
| M10 | **config.ts** | 모든 밸런싱 파라미터 집중 관리 (`SWING_CONFIG`, `CONTACT_CONFIG`, `BATTED_BALL_CONFIG` 등) |

### Nice-to-have

| # | 요구사항 | 설명 |
|---|---------|------|
| N1 | **Eye 스탯 반영** | KBO/MLB BB% 기반 Eye 스탯 추가 시 `eye_modifier` 활성화 |
| N2 | **낫아웃 (Dropped 3rd Strike)** | 포수 Defence 스탯 기반 포구 실패 확률. 조건: 1루 무주자 or 2아웃 |

---

## UX Acceptance Criteria / User Flows

*(Phase 3 해당 없음 — 순수 엔진 피처)*

---

## Plan

### Step 1: 타입 + 파라미터
- [ ] `src/lib/baseball/batting/types.ts` — `BattingState`, `BattingResult`, `AtBatResult`
- [ ] `src/lib/baseball/batting/config.ts` — `SWING_CONFIG`, `CONTACT_CONFIG`, `BATTED_BALL_CONFIG`, `HIT_RESULT_TABLE`

### Step 2: 개별 함수 구현
순서 의존성: `swing-decision` → `contact` → `batted-ball` → `hit-result` → `count`

- [ ] `bunt-stub.ts` — `decideBunt` (항상 `{ attempt: false }`)
- [ ] `swing-decision.ts` — `decideSwing`
- [ ] `contact.ts` — `resolveContact`
- [ ] `batted-ball.ts` — `calcBattedBall` (Box-Muller 정규분포 유틸 포함)
- [ ] `hit-result.ts` — `resolveHitResult`
- [ ] `count.ts` — `applyPitchToCount`

### Step 3: 통합 함수
- [ ] `hit-ball.ts` — `hitBall`

### Step 4: 검증
- [ ] `npx tsc --noEmit` 통과
- [ ] `scripts/simulate-batting.mjs` — `throwPitch → hitBall` 체인으로 100타석 시뮬레이션
  - 타석 단위 루프: 한 타석 내에서 `at_bat_over: true`가 될 때까지 투구 반복
  - 집계: K% / BB% / H/PA / HR/페어컨택 / 평균 투구수/타석
- [ ] K% 21~24%, BB% 7~10%, H/PA 20~24%, HR/페어컨택 3~6% 범위 확인

### 테스트 계획

**핵심 플로우 검증 (기존 투구 엔진 회귀)**
- `throwPitch` 단독 호출 — 타입 오류 없음 확인 (투구 엔진 인터페이스 불변)

**신규 피처 플로우 검증**
- HBP early return: `is_hbp: true` 투구 → `at_bat_result: 'hit_by_pitch'`, `at_bat_over: true`
- 파울 처리: 2스트라이크 상황에서 파울 → `next_count.strikes === 2` 유지
- 삼진: 3스트라이크 확정 → `at_bat_result: 'strikeout'`, `at_bat_over: true`
- 볼넷: 4볼 확정 → `at_bat_result: 'walk'`, `at_bat_over: true`
- 100타석 통계: K%/BB%/H/PA 목표 범위 내 확인

---

## Data Flow & Risk

### 데이터 흐름

```
[게임 루프 (다음 피처)]
  ┌─ 타석 시작
  │   BattingState 조립:
  │     batter, count = {0,0}, outs, runners, inning
  │     familiarity = 이전 타석 종료 시 decayFamiliarity() 결과 (또는 게임 첫 타석이면 {})
  │
  │  ┌─ 투구 루프 (at_bat_over: false인 동안 반복)
  │  │   throwPitch(GamePitchState) → PitchResult
  │  │     └─ next_familiarity → BattingState.familiarity 업데이트
  │  │     └─ next_stamina    → 투수 스태미나 업데이트
  │  │
  │  │   hitBall(BattingState, PitchResult) → BattingResult
  │  │     └─ next_count      → BattingState.count 업데이트
  │  │     └─ at_bat_over: false → 다음 투구로 이동
  │  │     └─ at_bat_over: true  → 타석 종료 처리로 이동
  │  └─
  │
  │  타석 종료 처리:
  │    at_bat_result 에 따라 주자 이동 / 아웃카운트 증가
  │    decayFamiliarity(familiarity) → 다음 타석용 familiarity 저장
  └─
```

### 테이블 Read/Write

| 테이블 | 역할 |
|--------|------|
| `baseball_players` | Read — 게임 시작 시 1회 로드, 이후 메모리 사용 |
| 그 외 | 없음 |

### 인터페이스 계약 (수비 엔진 연결 지점)

`resolveHitResult(exit_velocity, launch_angle)` 함수 시그니처는 수비 엔진 구현 후에도 유지된다.
수비 엔진 연결 시 이 함수의 **구현체만 교체**하고 호출부(`hit-ball.ts`)는 변경하지 않는다.

```
현재:  resolveHitResult(ev, la) → HIT_RESULT_TABLE 확률 모델
이후:  resolveHitResult(ev, la, defenders?, stadium?) → 수비 시뮬레이션 모델
```

### Risk & Rollback

| # | 위험 | 경감 | 롤백 |
|---|------|------|------|
| R1 | K%/BB%/H/PA 범위 이탈 | `HIT_RESULT_TABLE` + `SWING_CONFIG` 파라미터 조정 | config.ts 수정만으로 대응 |
| R2 | 파울 루프 무한 반복 가능성 | 게임 루프에서 최대 투구수 제한 필요 (엔진 책임 아님) | 게임 루프 레이어에서 처리 |
| R3 | `familiarity` 출처 혼동 | `throwPitch.next_familiarity` → `BattingState.familiarity` 흐름 고정, 문서화 | 흐름도 참조 |
| R4 | 수비 엔진 연결 시 인터페이스 깨짐 | `resolveHitResult` 시그니처 계약 고정 | 구현체만 교체 |
