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

---
---

# v2 — 통합 타격 모델 리워크 (2026-04-07)

> MVP(위 문서)에서 `fair_prob` 동전 던지기 + 독립적 EV/LA/방향각 생성으로 동작하던 타격 엔진을
> **물리적으로 연결된 통합 모델**로 교체.

## 동기

1. `fair_prob`으로 페어/파울을 결정하는 방식이 비물리적 — 방향각 기반으로 이미 교체됨 (2026-04-07 커밋)
2. EV, LA, 방향각이 서로 독립적으로 생성되어 "강한 타구인데 파울", "약한 타구인데 정면 페어" 같은 비현실적 조합 발생
3. 투구 예측 → 읽기 → 조정 파이프라인 부재 — 현재는 `decideSwing(zone_type, count)` 하나로 결정
4. EV 분포가 110~180km/h에 집중 — 60~100km/h 약한 타구(드리블러, 번트성 땅볼) 부재

## 핵심 변경사항 (MVP 대비)

| MVP 요구사항 | v2 변경 |
|---|---|
| M3: `decideSwing(zone_type, count)` | → **예측→읽기→조정→스윙 결정** 파이프라인 |
| M4: `resolveContact()` → `{ contact, is_fair }` | → `{ contact }` (is_fair 제거 — 방향각으로 결정, 이미 적용) |
| M5: `fair_prob`로 파울/페어 분기 | → **삭제** (방향각 ±45° 기준, 이미 적용) |
| M6: EV/LA 독립 생성 | → **timing_offset + center_offset → EV/LA/θ 통합 도출** |
| M7: `HIT_RESULT_TABLE` 확률 | → **수비 엔진 기반 판정** (이미 적용) |

## 새 모델 — 타격 파이프라인

### Phase 1: 투구 전 예측 (`predictPitch`)

```
입력: 투수 구종 목록, 최근 투구 히스토리 (familiarity), 카운트
출력: 예측 구종, 예측 코스 (zone)

예측 확률 공식:
  base_weight[i] = 구종 i의 종합 능력치 (ball_power + ball_speed + ball_break)
  repeat_penalty[i] = 최근 N구 내 등장 횟수에 비례한 차감
    → 직전 투구와 동일 구종: ×0.3
    → 최근 3구 내 등장: ×0.6
    → 그 외: ×1.0
  predict_prob[i] = normalize(base_weight[i] × repeat_penalty[i])

예측 코스:
  카운트 기반 존 기대 분포
  → 투수 유리 (0-2, 1-2): chase/ball 존 기대↑
  → 타자 유리 (3-0, 3-1): core/edge 존 기대↑
  → 중립 (초구 등): 투수 제구력 기반 분포
```

### Phase 2: 투구 후 읽기 (`readPitch`)

```
입력: 실제 PitchResult, 예측 결과, 타자 Eye 스탯
출력: 인지된 구종, 인지된 코스, 인지 정확도

투구 release 후 타자가 관찰:
  → 구종 인식 정확도 = f(Eye, 구종 난이도)
     체인지업/커터: 인식 어려움 (패스트볼과 유사한 arm action)
     커브/슬라이더: 인식 쉬움 (확연한 궤적 차이)
  → 코스 인식 정확도 = f(Eye)
     Eye 높을수록 스트라이크/볼 경계 정확하게 인식

인지 오차:
  perceived_zone = actual_zone + gaussian_noise(σ = f(1 - Eye/100))
  perceived_pitch_type = actual (정확 인식) or predicted (오인식), 확률적
```

### Phase 3: 스윙 결정 (`decideSwingV2`)

```
입력: 예측, 인지된 투구, 카운트
출력: swing (boolean)

결정 로직:
  1. 예측과 인지가 일치 → 자신감 높음 → 스윙 경향↑
  2. 예측과 인지가 불일치 → 혼란 → 스윙 경향↓ (홀드 경향)
  3. 인지된 코스가 볼이면 → 스윙 않으려 함
  4. 카운트 보정: 2S에서는 보호 스윙 경향↑, 3B에서는 소극적

P(swing) = base_swing_tendency
           × prediction_match_modifier
           × perceived_zone_modifier
           × count_modifier
```

### Phase 4: 컨택 판정 (`resolveContactV2`)

```
입력: swing=true, 실제 PitchResult, 인지 결과, 타자 Contact/Power
출력: contact (boolean), timing_offset, center_offset

timing_offset (타이밍 오차):
  → 예측 구종 vs 실제 구종의 속도 차이에서 발생
     패스트볼 예상 → 실제 체인지업: 타이밍 빠름 (양수)
     체인지업 예상 → 실제 패스트볼: 타이밍 느림 (음수)
  → Contact 스탯이 높을수록 조정 능력↑ (오차 축소)
  → timing_offset = (predicted_speed - actual_speed) / adjustment_factor(Contact)

center_offset (배트 중심 적중 오차):
  → 인지된 코스 vs 실제 코스 차이에서 발생
  → Contact 스탯이 높을수록 미세 조정 능력↑
  → center_offset = perceived_location - actual_location + gaussian_noise(σ = f(1 - Contact/100))

컨택 판정:
  miss_threshold = f(timing_offset, center_offset)
  → 둘 다 작으면 컨택 성공, 어느 하나라도 크면 헛스윙
```

### Phase 5: EV / LA / 방향각 통합 생성 (`calcBattedBallV2`)

```
입력: timing_offset, center_offset, Power, BallPower, 실제 pitch_speed
출력: exit_velocity, launch_angle, theta_h (방향각)

EV (exit_velocity):
  → 배트 중심 적중도가 주 결정 요인
  → base_ev = f(Power, BallPower, pitch_speed)
     Power > BallPower → EV 상승 (타자가 이김)
     Power < BallPower → EV 하락 (투수가 이김)
  → center_penalty = 1.0 - |center_offset| × k
     중심 적중: penalty ≈ 0 → EV 유지
     끝에 맞음: penalty 큼 → EV 급감 (드리블러/번트성 타구)
  → EV = base_ev × (1 - center_penalty) + noise

LA (launch_angle):
  → center_offset의 수직 성분이 주 결정 요인
  → 배트 아래쪽에 맞음 (offset > 0) → LA 높음 (팝업/플라이)
  → 배트 위쪽에 맞음 (offset < 0) → LA 낮음 (땅볼)
  → 정중앙 → LA ≈ 10~15° (라인드라이브)
  → LA = base_LA + center_offset_vertical × k_la + noise

θ (방향각):
  → timing_offset이 주 결정 요인
  → 빠른 스윙 (timing > 0) → 당기기 (우타: 좌측, 좌타: 우측)
  → 느린 스윙 (timing < 0) → 밀어치기 (반대)
  → 극단적 타이밍 → ±45° 초과 → 자연스럽게 파울
  → 배트 끝에 맞으면 방향 불안정성 추가 (noise 증가)
  → θ = timing_offset × k_theta × batter_handedness + center_instability_noise

상관관계 요약:
  center_offset ──→ EV (주), LA (주)
  timing_offset ──→ θ (주)
  center_offset ──→ θ (부, 불안정성 noise)
```

### Phase 6: 물리 궤적 + 수비 판정

기존 파이프라인 유지:
```
calcBattedBallPhysics(EV, LA, θ) → 궤적
  → resolveHitResult() → 수비 엔진 (인터셉트 모델)
```

추후 추가 (이번 범위 제외):
- 컨택 높이 h₀ 반영 (현재 0m → 0.9m)
- 담장 바운드 물리

## 데이터 흐름 (v2)

```
[투구 루프]
  throwPitch() → PitchResult
    ↓
  ① predictPitch(투수 구종, 히스토리, 카운트)
    → { predicted_type, predicted_zone }
    ↓
  ② readPitch(PitchResult, prediction, Eye)
    → { perceived_type, perceived_zone, accuracy }
    ↓
  ③ decideSwingV2(prediction, perception, count)
    → swing: boolean
    ↓  (swing=false → count update, 다음 투구)
  ④ resolveContactV2(PitchResult, perception, Contact)
    → { contact, timing_offset, center_offset }
    ↓  (contact=false → 헛스윙, count update)
  ⑤ calcBattedBallV2(timing, center, Power, BallPower, pitch_speed)
    → { exit_velocity, launch_angle, theta_h }
    ↓
  ⑥ classifyTerritory(theta_h)
    → fair / foul_catchable / foul_uncatchable
    ↓
  [fair] → resolveHitResult(EV, LA, batter, fielders, θ)
  [foul] → 기존 파울 처리 흐름
```

## 새로 필요한 스탯

| 스탯 | 내부명 | 역할 | 비고 |
|---|---|---|---|
| 선구안 | Eye | 투구 인식 정확도, 스트라이크/볼 판별 | 현재 50 고정 → 선수 데이터에 추가 필요 |

> Eye 스탯은 기존 PRD의 N1(Nice-to-have)이었으나, v2에서는 필수.

## 변경되는 파일

| 파일 | 변경 내용 |
|---|---|
| `batting/types.ts` | `BattingState`에 Eye 추가, 새 내부 타입 (PredictionResult, PerceptionResult 등) |
| `batting/config.ts` | 새 파라미터 (예측 가중치, 타이밍 계수, 센터 오프셋 계수 등) |
| `batting/predict-pitch.ts` | **신규** — 구종/코스 예측 |
| `batting/read-pitch.ts` | **신규** — 투구 인식 |
| `batting/swing-decision.ts` | 전면 교체 → `decideSwingV2` |
| `batting/contact.ts` | 전면 교체 → `resolveContactV2` (timing_offset, center_offset 출력) |
| `batting/batted-ball.ts` | 전면 교체 → `calcBattedBallV2` (통합 EV/LA/θ 생성) |
| `batting/hit-ball.ts` | 파이프라인 재구성 (6단계) |
| `types/player.ts` | Player.stats에 `eye` 필드 추가 |

## 구현 순서

```
Step 1: Player 타입에 Eye 스탯 추가
Step 2: predict-pitch.ts (예측 — 독립 모듈, 테스트 가능)
Step 3: read-pitch.ts (인식 — 독립 모듈)
Step 4: swing-decision.ts 교체 (예측+인식 기반)
Step 5: contact.ts 교체 (timing_offset + center_offset 출력)
Step 6: batted-ball.ts 교체 (통합 EV/LA/θ)
Step 7: hit-ball.ts 파이프라인 재구성
Step 8: 전체 캘리브레이션 (수비 모델 변경분 포함)
```

## 성공 기준 (v2)

MVP와 동일한 MLB 통계 범위 + 추가 기준:

| 지표 | 목표 범위 |
|---|---|
| K% | 21~24% |
| BB% | 7~10% |
| BA | 23~26% |
| BABIP | 28~32% |
| SLG | 38~43% |
| OPS | 0.690~0.760 |
| HR/FB | 10~15% |
| 땅볼/뜬공 비율 (GB/FB) | 1.0~1.5 |
| **페어/파울 비율** | **45~55% 페어** (fair_prob 제거 후 자연 발생) |
| **EV 분포** | **60~170km/h 전 범위** (약한 타구 포함) |

## Risk & Rollback (v2)

| # | 위험 | 경감 | 롤백 |
|---|------|------|------|
| R1 | 통계 범위 이탈 | 계수(k_theta, k_la 등) config.ts 집중 관리 | 계수 조정만으로 대응 |
| R2 | 예측 모델로 인한 게임 속도 저하 | 예측은 단순 확률 계산 (O(1)) | 영향 없음 |
| R3 | Eye 스탯 미적용 선수 존재 | 기본값 50 fallback 유지 | 기존 동작과 동일 |
| R4 | 기존 familiarity와 예측의 충돌 | 예측(차감)과 적응(보너스)은 서로 다른 단계에서 작용 | 독립 구현 |
