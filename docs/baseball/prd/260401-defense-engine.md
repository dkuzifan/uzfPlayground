---
title: "수비 엔진 #1 — 포구 판정"
date: 2026-04-01
owner: @dkuzifan
status: draft
series: 수비 엔진 (Defense Engine Module)
---

> **수비 엔진 시리즈**: 수비 상황의 개별 액션을 하나씩 구현하는 연속 피처.
> `#1 포구 판정` → `#2 송구 판정` → `#3 중계 플레이` → `#4 병살` → `#5 태그업` → `#6 에러` → `#7 시프트` → (…)

---

## Context

### 현재 문제

`resolveHitResult(exit_velocity, launch_angle)` 함수는 EV × LA 테이블로만 타구 결과를 결정한다.
수비수의 `Defence` 스탯이 결과에 전혀 영향을 주지 않아, 어떤 팀이 수비해도 동일한 안타/아웃 확률이 나온다.

### 목표 설계

수비수의 위치 좌표와 Defence 스탯을 타구 물리와 결합하여, **수비 능력이 실제 타구 결과에 반영**되도록 한다.
이 설계는 이후 `#7 시프트`에서 수비 포지션 좌표를 재배치하는 것만으로 시프트 효과가 자동 반영되는 구조적 기반이 된다.

### 타구 물리 모델

타구는 발사 이후 **두 페이즈**로 운동한다.

#### Phase A — 포물선 운동 (발사 ~ 첫 바운드)

참고 파일의 drag 방정식을 사용하되, 두 가지를 보완한다.

```
x(t) = (v₀·cosθ / D) × (1 − e^(−Dt))
y(t) = (−g·t / D) + ((D·v₀·sinθ + g) / D²) × (1 − e^(−Dt))
```

**보완 1 — 속도 구간별 D값 보정 (2차 항력 근사)**
실제 공기 저항은 v²에 비례하나, drag 방정식은 선형 근사다.
빠른 타구일수록 저항이 과소 추정되므로 D를 구간별로 보정한다:
```
EV ≤ 120 km/h:  D = 0.18
EV ≤ 150 km/h:  D = 0.22
EV > 150 km/h:  D = 0.27
```

**보완 2 — Magnus 효과 (carry_factor)**
백스핀이 걸린 타구는 양력으로 10~15% 더 멀리 날아간다.
이를 `carry_factor`로 근사 적용한다:
```
contact_quality = clamp((EV − 120) / 50, 0, 1)   // 120→0, 170km/h→1
carry_factor    = 1.0 + contact_quality × 0.12
range_adjusted  = range_raw × carry_factor
```

**첫 바운드 지점 계산**
`y(t) = 0` 을 풀어 `t_bounce` 를 구하고, `x_bounce = x(t_bounce)` 를 산출한다.
이 값이 타구의 **착지 거리(range)**다.

#### Phase B — 지면 구르기 (첫 바운드 이후)

첫 바운드 직후 수평 속도 `v_roll_0 = v_x(t_bounce) × restitution` 으로 감속 구르기 시작한다.

```
v_roll(t) = v_roll_0 × e^(−μ·t)

restitution = 0.5   // 잔디 기준 탄성 (인조잔디: 0.6)
μ           = 0.4   // 잔디 마찰 계수
```

수비수와의 관계에서 중요한 것은 **"공이 수비수 위치에 도달하는 시간"** 이므로,
Phase B는 내야 땅볼 처리 시 이 시간을 계산하는 데 사용한다.

### 필드 좌표계

1D range를 2D 필드 좌표로 변환한다.

```
direction_angle θ_h : 중견수 방향(0°)을 기준으로 좌(−)·우(+)
field_x = range × sin(θ_h)     ← 좌우 (1루 방향 = +)
field_y = range × cos(θ_h)     ← 전후 (홈→중견수 = +)
```

`θ_h` 는 타자 타석(좌타/우타)에 따른 당기기 편향 + 정규분포 노이즈로 결정한다.

### 수비수 위치 좌표 (기본값)

각 포지션의 기본 수비 위치를 좌표로 정의한다.
`#7 시프트`에서는 이 좌표를 타자/상황에 따라 변경한다.

| 포지션 | field_x (m) | field_y (m) | 설명 |
|--------|-------------|-------------|------|
| P  | 0    | 17   | 투수 마운드 |
| C  | 0    | −1   | 포수 |
| 1B | 11   | 24   | 1루수 |
| 2B | 10   | 33   | 2루수 |
| SS | −8   | 33   | 유격수 |
| 3B | −11  | 24   | 3루수 |
| LF | −35  | 80   | 좌익수 |
| CF | 0    | 100  | 중견수 |
| RF | 35   | 80   | 우익수 |

*(홈 플레이트 = 원점, 중견수 방향 = +y)*

### 포구 판정 로직

```
착지 좌표 (field_x, field_y)
  → 담당 수비수 선택 (가장 가까운 수비수 또는 포지션 기반)
  → 수비수와 착지 지점 거리 d (m)
  → P_out = f(Defence, d, ball_type)
```

`ball_type` 별 기준 커버리지:
- **팝업**: 항상 `out`
- **플라이볼**: 수비수가 `d` 거리를 이동해 포구 가능 여부 → `P_out`
- **라인드라이브**: 높은 base P_hit (0.65), 거리로 소폭 보정
- **내야 땅볼**: Phase B 도달 시간 vs 수비수 반응 시간 비교

---

## Goals / Non-Goals

### Goals (MVP)

**G1. 타구 물리 계산 — `calcBattedBallPhysics()`**
- EV + LA → drag 방정식(D 구간 보정 + Magnus carry_factor) → `range`
- `y(t) = 0` 이진 탐색으로 `t_bounce` 산출 (허용 오차 0.001s, 최대 50회 반복)
- 방향각 θ_h → `(field_x, field_y)` 착지 좌표 산출
- 첫 바운드 속도 `v_roll_0` 산출 (내야 땅볼 Phase B용)

**G2. 방향각 선택 — `selectDirectionAngle()`**
- 중견수 기준(0°) ± 45° 범위에서 정규분포 노이즈로 선택
- 우타자: μ = −5° (좌측 당기기), 좌타자: μ = +5° (우측 당기기)
- 극단 방향(파울라인 근처): 클램프 처리

**G3. 담당 수비수 선택 — `findResponsibleFielder()`**
- `(field_x, field_y)` 와 각 수비수 기본 위치 좌표 비교
- 가장 가까운 수비수를 담당으로 선택
- 포지션 좌표 미등록 시 기본 Defence 70 사용 + `console.warn`

**G4. 포구 확률 계산 — `calcCatchProbability()`**
- 플라이/라인드라이브: `P_out = base − k × max(d − coverage_radius, 0)`
  - `coverage_radius`: Defence 스탯 기반 (Defence 70 → 8m, 100 → 12m)
  - `k`: 거리당 P_out 감소율 (0.04/m)
- 내야 땅볼: `t_ball` (Phase B 도달 시간) vs `t_fielder` (반응+이동 시간) 비교
  - `t_fielder = reaction_time + d / fielder_speed`
  - `t_ball < t_fielder` → P_out 낮음, `t_ball > t_fielder` → P_out 높음
- 팝업: P_out = 1.0

**G5. 타구 결과 종류 결정** (`resolveHitResult` 책임)
- `out`: 포구 성공
- `home_run`: `range ≥ fence_distance` (구장별 상수, 기본 120m)
- 히트 시 타입은 착지 거리(`range`)만으로 결정 (주루 스탯은 이번 범위 제외):
  - range < 36m (내야): `single`
  - 36m ≤ range < 70m: `single` (70%) / `double` (30%)
  - range ≥ 70m: `double` (60%) / `triple` (10%) / `single` (30%)

**G6. `resolveHitResult()` 교체**
- 기존 `(EV, LA)` 시그니처 → `(EV, LA, batter, fielders)` 로 확장
- 반환 타입 변경 없음 (`AtBatResult` 서브셋)
- 호출부 `hit-ball.ts` 에서 수비팀 라인업 전달하도록 수정

**G7. `Player` 타입에 수비 좌표 추가**
- `Player.defence_pos?: { x: number; y: number }` 옵셔널 필드 추가
- 미설정 시 포지션 기본값 테이블에서 조회

---

### Non-Goals

- **병살(DP)**: `#4` 에서 구현
- **태그업**: `#5` 에서 구현
- **에러**: `#6` 에서 구현
- **시프트**: `#7` 에서 구현 (이번 피처가 좌표 기반 설계를 깔아주는 것으로 준비 완료)
- **주자 진루 고도화**: `runner-advance.ts` 고정 룰 유지 (송구 판정 `#2` 이후 변경)
- **UI 변경**: 순수 엔진 로직, 게임 화면 변화 없음

---

## Success Definition

- 동일 타자로 100회 시뮬레이션 시, Defence 80+ 팀의 BABIP가 Defence 50 팀보다 낮다
- `runGame()` 출력의 HR/FB%, BABIP가 MLB 평균에 근접한다
  - 목표: BABIP ≈ .280~.310, HR/FB ≈ 10~14%
- `#7 시프트` 구현 시 수비수 좌표 변경만으로 시프트 효과가 반영된다 (엔진 수정 불필요)
- 기존 게임 루프(`runGame`, `runAtBat`) 정상 동작 유지

---

## UX Acceptance Criteria

해당 없음 (순수 엔진 피처). 결과는 기존 PBP 로그에 자연스럽게 반영된다.

---

## User Flow

해당 없음 (엔진 내부 변경).

---

## Requirements

### Must-have

**R1. 타구 물리 계산 — `calcBattedBallPhysics(ev, la)`**
- drag 방정식에 D값 구간 보정 적용 (EV ≤ 120: 0.18 / ≤ 150: 0.22 / 그 초과: 0.27)
- Magnus carry_factor 적용 (`contact_quality` 기반 0~12% range 보정)
- `y(t) = 0` 이진 탐색(허용 오차 0.001s, 최대 50회)으로 `t_bounce` 산출
- 출력: `{ range: number, v_roll_0: number, t_bounce: number }`

**R2. 방향각 선택 — `selectDirectionAngle(batter)`**
- 중견수 기준 0° 에서 정규분포(σ = 25°)로 방향각 산출
- 우타자 편향 μ = −5°, 좌타자 μ = +5° (당기기)
- 클램프: −42° ~ +42° (파울라인 내)
- 출력: `θ_h: number` (단위: degree)

**R3. 착지 좌표 변환 — `toFieldCoords(range, θ_h)`**
- `field_x = range × sin(θ_h × π/180)`
- `field_y = range × cos(θ_h × π/180)`
- 출력: `{ field_x: number, field_y: number }`

**R4. 수비수 포지션 좌표 테이블 — `FIELDER_DEFAULT_POS`**
- 9개 포지션별 기본 `(x, y)` 상수 테이블 (`src/lib/baseball/defence/fielder-positions.ts`)
- `Player` 타입에 옵셔널 필드 추가: `defence_pos?: { x: number; y: number }`
- 미설정 시 `FIELDER_DEFAULT_POS[position_1]` 으로 폴백

**R5. 담당 수비수 선택 — `findResponsibleFielder(coords, fielders)`**
- 착지 좌표와 각 수비수 위치 간 유클리드 거리 계산
  - 수비수 위치: `player.defence_pos ?? FIELDER_DEFAULT_POS[player.position]`
  - 폴백 책임은 이 함수 내부에서 일괄 처리 (R4와 중복 없음)
- 거리가 가장 짧은 수비수를 담당으로 반환
- `FIELDER_DEFAULT_POS`에도 해당 포지션이 없으면 `console.warn` 후 Defence 70 기본값 사용

**R6. 포구 확률 계산 — `calcCatchProbability(ballType, d, fielder)`**
- **팝업**: `P_out = 1.0`
- **플라이/라인드라이브**:
  ```
  coverage_radius = 6 + (fielder.defence / 100) × 6   // 6m~12m
  P_out = clamp(0.95 − 0.05 × max(d − coverage_radius, 0), 0.05, 0.95)
  ```
- **내야 땅볼**:
  ```
  fielder_speed = 3.5 + (fielder.defence / 100) × 1.5   // 3.5~5.0 m/s
  // t_ball: 지수 감속 모델에서 공이 거리 d 이동하는 시간
  //   d = v_roll_0/μ × (1 − e^(−μ·T))  →  T = −ln(1 − d×μ/v_roll_0) / μ
  //   (d × μ ≥ v_roll_0 이면 공이 멈추므로 T = ∞, P_out = 1.0)
  t_ball     = −ln(1 − d×μ / v_roll_0) / μ
  t_fielder  = 0.4(반응시간) + d / fielder_speed
  P_out = clamp(0.3 + (t_ball − t_fielder) × 0.15, 0.05, 0.90)
  ```

**R7. 홈런 판정 — `isHomeRun(range, fieldY)`**
- `range ≥ FENCE_DISTANCE` 이면 `home_run` 반환
- `FENCE_DISTANCE` 기본값: 120m (구장 상수, `stadiums.ts` 에 추가)

**R8. 히트 종류 결정 — `resolveHitType(range)`**
- range < 36m: `single`
- 36m ≤ range < 70m: `single` 70% / `double` 30%
- range ≥ 70m: `single` 30% / `double` 60% / `triple` 10%
- *(주자 주루 스탯 반영은 이번 범위 외. `#2 송구 판정` 이후 고도화 예정)*

**R9. `resolveHitResult` 시그니처 변경**
- 기존: `(ev, la) → AtBatResult`
- 변경: `(ev, la, batter: Player, fielders: Player[]) → AtBatResult`
- 반환 타입 동일 유지

**R10. 호출 체인 수정**
- `hit-ball.ts`: `calcBattedBall` 호출 후 `resolveHitResult`에 `fielders` 전달
- `at-bat.ts`: `runAtBat` 파라미터에 `defenceLineup: Player[]` 추가
- `half-inning.ts`: `runAtBat` 호출 시 상대팀 라인업 전달
- `game-loop.ts`: `runHalfInning` 호출 시 수비팀 라인업 전달

---

### Nice-to-have

**N1. 구장별 펜스 거리**
- `stadiums.ts` 의 Stadium 타입에 `fence_distance_lf / cf / rf` 필드 추가
- 방향각에 따라 해당 펜스 거리를 참조해 HR 판정

**N2. 잔디 종류별 마찰 계수**
- `stadiums.ts` 에 `surface: 'grass' | 'turf'` 추가
- `restitution`, `μ` 값을 구장별로 다르게 적용

**N3. 포지션별 coverage_radius 차등**
- CF: 커버리지 반경 +2m 보정 (넓은 범위 책임)
- C·1B: 내야 특수 포지션 별도 보정

---

## Implementation Plan

(Phase 5에서 작성)

---

## Risk & Rollback

(Phase 6에서 작성)
