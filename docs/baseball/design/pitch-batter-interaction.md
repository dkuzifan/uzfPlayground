# 야구 시뮬레이터 엔진 설계 결정사항

> 논의 날짜: 2026-03-28
> 상태: 진행 중

---

## 0. 스탯 정의

### 투수 스탯 (4개)

| 스탯 | 내부명 | 설명 |
|------|--------|------|
| 구위 | BallPower | 타구 속도 결정 (타자 파워와 비교) |
| 제구 | BallControl | 코스 정확도 — 제구 오차 타원 크기 결정 |
| 변화 | BallBreak | 구종별 무브먼트/브레이크 양 |
| 구속 | BallSpeed | 홈까지 이동 시간 결정 |

> 투수 전체 스탯(BallPower/Control/Break/Speed)은 구종별 값을 `weight` 기준 가중 평균하여 산출. 게임 엔진은 구종별 개별 값을 직접 사용.

### 타자 스탯 (5개)

| 스탯 | 내부명 | 설명 |
|------|--------|------|
| 컨택 | Contact | 컨택 성공 확률, 타구 일관성 |
| 파워 | Power | 타구 속도 (구위와 비교) |
| 수비 | Defence | 낙구 지점 예측 타이밍, 포구 성공률, 송구 정확도 |
| 송구 | Throw | 최대 송구 거리, 속도 |
| 주루 | Running | 베이스 이동 속도 |

### 공통 스탯 (1개)

| 스탯 | 내부명 | 설명 |
|------|--------|------|
| 체력 | Stamina | 모든 선수 보유 — 투구/타격/주루/수비에 의해 소모. 소진 시 투수는 강판, 야수는 이동속도·수비 능력 저하 |

> **선구안(Eye)**: KBO 데이터에서 BB%로 뽑을 수 있는지 추후 확인. 가능하면 추가, 불가능하면 제외.

---

## 1. 투수의 구종 선택 전략

### 기본 원칙
투수는 자신이 가장 강한 공을 던지고 싶어하지만, 타자가 눈에 익지 않도록 반복을 피하려는 경향을 가진다.

### 선택 확률 공식

```
최종 선택 확률[i] = normalize( 기본 가중치[i] × 반복 패널티[i] × 상황 보정 )

기본 가중치[i]  = 구종i의 (구위 + 구속 + 변화) 합 / 전체 구종 스탯 합
반복 패널티[i]  = 1 / (1 + k × 최근 N구에서 구종i 사용 횟수)
상황 보정       = 위기 상황(풀카운트, 득점권 주자)이면 주무기 가중치에 ×boost
```

### 파라미터 (밸런싱 필요)
| 파라미터 | 초기값 | 설명 |
|---------|-------|------|
| `k` | 0.6 | 반복 패널티 강도. 높을수록 같은 구종 회피 강함 |
| `N` | 5 | 반복 판단 윈도우 (최근 몇 구를 볼지) |
| `boost` | 1.5 | 위기 상황 주무기 보정 배수 |

---

## 2. 타자의 구종 예측 및 익숙함 시스템

### 기본 지식
타자는 투수의 **주무기·2번째 무기의 존재**는 알고 있다.
단, 실제 궤적·감각은 모르기 때문에 처음엔 예측이 확률에 불과하다.

### 구종 예측 확률
타자의 예측도 투수 스탯 기반으로 계산한다.

```
타자 예측 확률[i] = 투수의 기본 가중치[i] (구종 선택 공식의 기본 가중치와 동일)
```

즉, 타자는 "이 투수가 직구를 많이 던질 것 같다"는 사전 지식은 있으나,
실제 구종·코스 확인 전까지는 확률적 예측에 그친다.

### 익숙함 (Familiarity)

**단위**: 구종 × 코스(zone)별로 독립 추적

| 범위 | 효과 | 누적 방식 |
|------|------|---------|
| 현재 타석 내 | 강함 | 볼 때마다 familiarity 증가 → 컨택 확률 보정 |
| 같은 경기 다음 타석 | 약함 | 타석 종료 시 일정 비율로 감쇠하여 잔존 |
| 다음 경기 이후 | 없음 | 완전 초기화 |

**익숙함이 미치는 영향**
- familiarity가 높을수록 해당 구종×코스 조합에 대한 타자의 **컨택 확률**이 소폭 상승
- 투수 입장에서는 반복 패널티 공식으로 이를 간접적으로 회피하려 한다

### 타석 간 감쇠 공식 (초안)
```
다음 타석 familiarity[pitch][zone] = 현재 타석 familiarity × decay_rate
decay_rate = 0.2  (타석 내 대비 20%만 잔존)
```

---

## 3. 타구 물리 시뮬레이션

### 좌표계
```
원점: 홈플레이트
x축: 좌우 (1루 방향 +, 3루 방향 -)
y축: 홈→외야 방향
z축: 높이
```

### 기본 수비 포지션 (미터)
| 포지션 | x | y |
|-------|---|---|
| 포수 | 0.0 | -1.2 |
| 투수 | 0.0 | 18.4 |
| 1루수 | 24.0 | 22.0 |
| 2루수 | 13.0 | 33.0 |
| 유격수 | -13.0 | 33.0 |
| 3루수 | -24.0 | 22.0 |
| 좌익수 | -38.0 | 72.0 |
| 중견수 | 0.0 | 85.0 |
| 우익수 | 38.0 | 72.0 |

### 타구 궤적: 3D 연속 추적
플라이볼/라이너/땅볼 모두 매 시간 스텝(0.05s)마다 x(t), y(t), z(t)를 계산.
수비수가 경로상 어느 지점이든 도달 가능하면 아웃으로 판정.

### 땅볼 처리 (바운드 시뮬레이션)
```
[1단계] 컨택 높이 h₀에서 발사 → 최초 바운드 위치 계산
  t₁ = (v₀·sin(θ) + √(v₀²·sin²(θ) + 2·g·h₀)) / g
  x₁ = v₀·cos(θ)·t₁

[2단계] 바운드 후 속도 변환
  vx_after = vx_before × ground_friction
  vy_after = -vy_before × COR

[3단계] vy_after가 임계값 이하 → 구름 전환
  vx(t) = vx_rolling × e^(-rolling_friction × t)
```

### 땅볼 파라미터
| 파라미터 | 초기값 | 의미 |
|---------|-------|------|
| `h₀` | 0.9m | 표준 컨택 높이 |
| `COR` | 0.45 | 반발계수 (잔디 기준) |
| `ground_friction` | 0.80 | 바운드 시 수평 속도 잔존율 |
| `rolling_friction` | 0.15 | 구름 감속 계수 |

---

## 4. 수비수 포지셔닝 시스템

### 레이어 구조
```
레이어 1 — 기본 위치 (항상 존재, 모든 모드 공통)
레이어 2 — 프리셋 (상황 자동 적용 or 감독 수동 선택)
레이어 3 — 개별 수동 조정 (감독 모드 전용)
```

### 모드별 사용 범위
| 모드 | 레이어 1 | 레이어 2 | 레이어 3 |
|------|--------|--------|--------|
| 순수 시뮬레이션 | ✅ | ✅ 자동 | ❌ |
| 감독 모드 | ✅ | ✅ 수동/자동 | ✅ |

### 기본 프리셋 목록
| 프리셋명 | 자동 발동 조건 |
|---------|-------------|
| 전진 수비 | 9회 이하 1점차, 3루 주자 |
| 더블플레이 대비 | 1루 주자, 0~1아웃 |
| 1루 주자 견제 | 1루 주자 있을 때 |
| 번트 대비 | 번트 상황 예상 시 |
| 좌타자 시프트 | 강한 풀히터 등판 시 |
| 외야 깊게 | 홈런 허용 불가 상황 |

### 스탯 역할 분리
| 스탯 | 역할 |
|------|------|
| 수비(Defence) | 낙구 읽는 시점, 포구 성공 확률, 송구 정확도 |
| 주루(Running) | 수비 이동 속도 → 3D 물리에서 도달 가능 거리 계산 |
| 송구(Throw) | 송구 최대 거리, 속도 |
| 체력(Stamina) | 후반 이닝 이동속도 감쇠 여부 (미결정) |

---

## 5. 포구 성공 확률

### 공통 전제

도달 가능 여부(3D 물리 계산)와 포구 성공 확률은 별개다.
- 도달 가능 = 물리적으로 공이 있는 위치에 손이 닿을 수 있는가
- 포구 성공 = 도달했을 때 실제로 공을 잡는가

**play_difficulty**: 도달하기 위해 이동한 거리와 남은 시간으로 산출.
수비수가 전력으로 달려야 했던 공일수록 포구 난이도가 높다.

```
play_difficulty = clamp(move_distance / (time_remaining × top_speed), 0, 1)
// 0 = 여유 있게 잡음, 1 = 간신히 도달한 다이빙 캐치 수준
```

---

### 방안 A: 수비 스탯만 활용

```
catch_probability = base_rate(Defence, play_difficulty)

base_rate = max(min_catch,
  Defence_factor - difficulty_penalty × play_difficulty
)

Defence_factor  = 0.70 + (Defence / 100) × 0.29   // 0.70 ~ 0.99
difficulty_penalty = 0.50                           // 어려운 공일수록 최대 -50%p
min_catch = 0.05                                    // 간신히 도달하면 최소 5%는 잡음
```

**예시:**
| 상황 | Defence 80 | Defence 40 |
|------|-----------|-----------|
| 여유 있는 정면 타구 (difficulty 0.1) | 97% | 81% |
| 옆으로 달려서 잡는 타구 (difficulty 0.5) | 72% | 56% |
| 전력 다이빙 (difficulty 0.9) | 47% | 31% |

**특징**: 구현 단순. 수비 스탯 하나로 범위와 안정성을 모두 표현.
**단점**: "범위는 넓지만 불안정한" 선수와 "범위는 좁지만 안정적인" 선수를 구분 못함.

---

### 방안 B: 수비 + 집중력 스탯 함께 활용

```
catch_probability =
  base_rate(Defence, play_difficulty)      // 방안 A와 동일
  × concentration_modifier(concentration, pressure_level)

concentration_modifier = 1.0 - pressure_drop × pressure_level
pressure_drop = max(0, (50 - concentration) / 100)
// 집중력 50 이상이면 압박 페널티 없음
// 집중력 50 미만이면 압박 상황에서 성공률 감소

pressure_level: 0.0 ~ 1.0
  // 0 = 무관중 연습 수준 (영향 없음)
  // 1 = 끝내기 상황, 만루, 9회말
```

**예시 (play_difficulty 0.5 기준):**
| | 집중력 80 | 집중력 50 | 집중력 20 |
|--|---------|---------|---------|
| 무압박 상황 | 72% | 72% | 72% |
| 중간 압박 (0.5) | 72% | 72% | 57% |
| 최고 압박 (1.0) | 72% | 72% | 42% |

**특징**: "실력은 있지만 멘탈이 약한" 선수 표현 가능. 경기 흐름에 따른 심리 요소 반영.
**단점**: 스탯 하나가 추가되므로 선수 데이터 설계 복잡도 증가.

---

---

## 6. 타석 결과 판정

### 6-1. 파울 판정

베이스 기준점: `base_y = 27.432m` (1루/3루 위치)

```
[내야 구간] 첫 바운드 y₁ < base_y:

  Case A: |x₁| > y₁         → 즉시 FOUL (파울 지역 착지)

  Case B: |x₁| ≤ y₁ (페어 착지 후 굴러서 파울 가능)
    → 공이 y = base_y를 통과하는 시점의 x 확인:
        |x| > base_y  → FOUL
        |x| ≤ base_y  → FAIR 확정 (이후 어디로 가든 페어)

[외야 구간] 첫 바운드 y₁ ≥ base_y:

  |x₁| > y₁  → FOUL
  |x₁| ≤ y₁  → FAIR 확정
```

### 6-2. 홈런 판정

구장마다 펜스 프로필을 개별 정의한다. 타구 궤적이 해당 각도의 `fence_distance`에 도달할 때 `z(t) > fence_height`이면 홈런.

```typescript
type FenceSegment = {
  angle_from: number;  // 스프레이 각도 (°), 중앙=0, 좌=-45, 우=+45
  angle_to:   number;
  distance:   number;  // 홈플레이트 → 펜스 거리 (m)
  height:     number;  // 펜스 높이 (m)
};
```

**KBO 대표 구장 예시 (잠실)**
| 구역 | 각도 | 거리 | 펜스 높이 |
|------|------|------|----------|
| 좌측 폴 | -45° | 100m | 4.0m |
| 좌중간 | -22.5° | 116m | 3.7m |
| 중앙 | 0° | 125m | 3.7m |
| 우중간 | +22.5° | 116m | 3.7m |
| 우측 폴 | +45° | 100m | 4.0m |

### 6-3. 히트 종류 판정 (단타/2루타/3루타)

포구 실패 후 수비수의 픽업 → 송구 시간과 주자의 이동 시간을 비교해 결정한다.
수비 시프트가 적용된 포지션이 그대로 반영되므로 시프트의 효과(단타/장타 차이)가 자연스럽게 나타난다.

#### 흐름

```
포구 실패 확정
  → 수비수: 볼 착지 지점으로 계속 이동 → pickup_time 계산
  → 픽업 후 해당 베이스로 송구 → throw_arrive[n] 계산
  → 주자 이동 시간 runner_split[n]과 비교
  → 가장 먼 SAFE 베이스 = 타구 결과
```

#### 주자 이동 시간

```
split(n) = FIELDING_CONFIG.split_default[n] × (100 / Running)
```

#### 판정 로직

```
for n in [3, 2, 1]:  // 가장 먼 루부터 확인
  throw_arrive[n] = pickup_time + FIELDING_CONFIG.pickup_delay + throw_dist[n] / throw_speed
  if runner_split[n] < throw_arrive[n]:
    return n루타     // 첫 번째 SAFE 루 = 결과
```

#### 파라미터

```
FIELDING_CONFIG = {
  pickup_delay:   0.30,  // 땅볼 픽업 → 송구 딜레이 (s) (밸런싱 대상)
  relay_reaction: 0.30,  // 중계/pivot 수신 → 재송구 딜레이 (s) (밸런싱 대상)
  throw_speed:    30.0,  // 기본 송구 속도 (m/s, Throw 스탯 보정)
  sprint_speed:   8.0,   // 수비수 볼 추구 속도 (m/s)
  split_default:  { 1B: 4.2, 2B: 7.8, 3B: 11.4 },  // 타자 루별 도달 기준 시간 (s)
}
```

> `relay_reaction`은 더블플레이 pivot (Section 6-4), 1+3루 더블 스틸 중계 (Section 15-5)에서 공통 참조.

### 6-4. 더블플레이 (Double Play)

Section 6-3 땅볼 처리에서 주자가 포스 베이스에 있을 때 병살 가능성을 추가로 판단한다.

```
// 1차 아웃: 야수 → 포스 베이스 송구 (Section 6-3 동일)
//           포스아웃 확정 → pivot man 중계 시작

pivot_throw_time = FIELDING_CONFIG.relay_reaction
                 + dist(pivot_base → 1B) / (pivot.Throw × throw_speed_factor)

batter_1B_time   = split(1B)   // Section 6-3 주자 이동 시간 동일

if batter_1B_time > pivot_throw_time:
  → 2차 아웃 (타자 1루 아웃) → 병살 완성 (2아웃 동시 처리)
else:
  → 1차 아웃만 (타자 1루 세이프)
```

**병살 발동 조건:**
```
주자가 포스 베이스에 있음 (1루, 또는 1·2루, 만루 등)
AND outs < 2
AND 타구가 내야 땅볼
```

**라인 드라이브 병살:**
```
야수가 라인 드라이브 포구 (fly ball catch) → 주자가 귀루 못한 경우
  → Section 12-5 태그업/귀루 로직으로 처리 (별도 로직 없음)
```

---

## 7. 타자 컨택 시스템

### 한 구의 흐름

```
투구
 → [스윙 여부]
     취함 → 볼/스트라이크 판정 끝
     스윙 → [헛스윙 / 파울 / 페어 컨택]
                         ↓ 페어 컨택
                      타구 속도 + 발사각 → 3D 물리 (Section 3)
```

### 존(Zone) 분류

| 존 타입 | 설명 |
|---------|------|
| `core` | 스트라이크 존 중심부 |
| `edge` | 스트라이크 존 경계 |
| `chase` | 볼이지만 경계 근처 |
| `ball` | 명확한 볼 |
| `dirt` | 지면에 바운드되는 공 (z ≤ 0) |

---

> **⚠️ v2 리워크 (2026-04-07)**: Section 7-1 ~ 7-3은 MVP 설계. v2에서는 아래 모델로 교체.
> 상세 스펙: `docs/baseball/prd/260330-baseball-batting-engine.md` — v2 섹션 참조.
>
> **v2 파이프라인 요약**:
> ```
> ① predictPitch (투구 전 구종/코스 예측 — 패턴 기반 차감)
> ② readPitch (투구 후 인식 — Eye 스탯 기반)
> ③ decideSwingV2 (예측 vs 인식 비교 → 스윙 결정)
> ④ resolveContactV2 → timing_offset + center_offset 출력
> ⑤ calcBattedBallV2 → EV/LA/θ 통합 생성
>     - center_offset → EV (주), LA (주)
>     - timing_offset → θ (주)
> ⑥ 기존 수비 엔진으로 궤적+판정
> ```
>
> **핵심 변경**: `fair_prob` 삭제 (방향각 ±45° 기반), EV/LA/θ 물리적 상관관계 부여

### 7-1. 스윙 여부 (선구안)

```
P(swing) = base_swing[zone] × count_modifier × eye_modifier

base_swing:
  core:  0.85
  edge:  0.65
  chase: 0.35
  ball:  0.10
  dirt:  0.20

count_modifier:
  0-2: +0.10  (공격적)
  3-0: -0.15  (소극적)
  3-2: +0.05
  기타: 0

eye_modifier = (Eye - 50) / 200
  // Eye 100 → +0.25 / Eye 0 → -0.25
  // Eye 스탯은 KBO BB% 기반으로 추후 논의
```

---

### 7-2. 컨택 확률 (스윙 시)

```
contact_prob = base_contact[zone]
             × pitch_modifier
             × familiarity_bonus

base_contact:
  core:  0.55 + (Contact/100) × 0.40   // 0.55 ~ 0.95
  edge:  0.35 + (Contact/100) × 0.35   // 0.35 ~ 0.70
  chase: 0.15 + (Contact/100) × 0.25   // 0.15 ~ 0.40
  ball:  0.05 + (Contact/100) × 0.15   // 0.05 ~ 0.20
  dirt:  0.10 + (Contact/100) × 0.15   // 0.10 ~ 0.25

pitch_modifier = 1.0 - (구위 + 구속 + 변화) / 300 × 0.30
  // 구종 난이도 최대 -30%

familiarity_bonus = 1.0 + familiarity × 0.15
  // Section 2의 familiarity 재활용, 최대 +15%
```

컨택 성공 시 페어/파울 분기:

```
P(fair | contact):
  core:  0.75
  edge:  0.55
  chase: 0.35
  dirt:  0.20
```

> **파울팁 처리**: 파울 컨택은 단순히 파울 처리 (스트라이크 추가, 2스트라이크 이후에도 카운트 유지). 별도 포구 판정 없음.

---

### 7-3. 페어 컨택 품질 (타구 속도 + 발사각)

3D 물리(Section 3)의 초기값이 된다.

```
exit_velocity = 130 × power_factor × quality_roll  (km/h)

power_factor  = 0.70 + (Power/100) × 0.60        // 0.70 ~ 1.30
quality_roll  = random_normal(mean=1.0, std=σ)
  σ = 0.08 × (1 - Contact/200)                   // 컨택 높을수록 타구 일관성 증가

launch_angle  = zone_base_angle + noise
  zone_base_angle:
    high_zone: 5°   (낮은 발사각)
    mid_zone:  20°
    low_zone:  35°  (높은 발사각)
  noise = random_normal(0, 12°)                   // Contact 높을수록 noise 감소
```

---

## 8. 낫아웃 (Dropped Third Strike)

### 발동 조건 (실제 룰)

```
3스트라이크 확정 + 아래 중 하나:
  - 1루 무주자
  - 2아웃

→ 포수가 공을 놓치면 타자가 1루로 달릴 수 있다
→ 1루 주자 있고 2아웃 미만 → 낫아웃 불가, 그냥 삼진
```

### 포수 포구 실패 확률

```
base_drop_rate[zone]:
  dirt:      0.50
  low zone:  0.12
  mid/high:  0.02

catcher_block = (Defence_catcher / 100) × 0.40

drop_prob = max(0, base_drop_rate[zone] - catcher_block)
```

수비 100 포수: dirt 공도 `0.50 - 0.40 = 10%`
수비 0 포수: dirt 공 50% 그대로

### 발동 후: 포수-타자 레이스

Section 6-3 송구 로직 재활용:

```
pickup_time  = 포구 실패 위치 → 공 픽업 시간
throw_arrive = pickup_time + reaction_delay + dist(포수→1루) / throw_speed
runner_split = dist(홈→1루) / runner_speed  // 타자 Running 스탯

runner_split < throw_arrive  → SAFE (낫아웃 성공)
runner_split ≥ throw_arrive  → OUT
```

### 전략적 의미

낮은 변화구(커브, 포크볼)를 dirt zone에 던지는 유인구 전략이 생긴다.
- 타자 입장: 헛스윙 유도 + 낫아웃 기회
- 투수 입장: 포수 수비력이 낮으면 역효과 가능

→ 추후 투수 AI 전략 섹션에서 "dirt ball 유인구" 옵션으로 연결

---

## 9. 볼카운트 시스템

### 9-1. ABS 스트라이크 존

심판 편차 없이 물리적 좌표만으로 판정한다.

```
야구공 반지름: 3.65cm

strike_zone (expanded):
  x: -(21.6 + 3.65) ~ +(21.6 + 3.65)  = ±25.25cm
  z: (zone_bottom - 3.65) ~ (zone_top + 3.65)

판정: 공 중심 좌표가 expanded strike_zone 안에 들어오면 → STRIKE
     (공 끝이 1%라도 존에 걸치면 스트라이크)

zone_bottom / zone_top: 타자 체형 기반, 추후 선수 데이터에 정의
```

### 9-2. 카운트 규칙

| 상황 | 결과 |
|------|------|
| 스윙 미스 | 스트라이크 +1 |
| 취함 + 존 안 | 스트라이크 +1 |
| 취함 + 존 밖 | 볼 +1 |
| 파울 (2스트라이크 미만) | 스트라이크 +1 |
| 파울 (2스트라이크 이후) | 카운트 유지 |
| 파울팁 | 파울과 동일 처리 (별도 포구 판정 없음) |

### 9-3. 타석 종료 조건

```
스트라이크 3  → 삼진
  └─ 낫아웃 조건 해당 시 → Section 8 분기

볼 4          → 볼넷 (타자 1루 진루)

페어 컨택      → 타구 판정 (Section 6)

사구 (HBP)    → Section 10 (제구 시스템) 참조
```

### 9-4. 볼넷 후 주자 처리 (강제 진루)

```
1루 비어있음          → 타자만 1루
1루 주자만            → 1루→2루, 타자→1루
1·2루 주자            → 2루→3루, 1루→2루, 타자→1루
만루                  → 3루→홈(득점), 2루→3루, 1루→2루, 타자→1루
```

---

### 스탯 데이터 소스 (미결정 — 추후 논의)

실제 선수 데이터에서 스탯을 뽑는 방법은 별도로 논의 예정.
KBO 기준으로 UZR, 구종 데이터 등 고급 스탯 접근이 제한적인 점을 감안해야 함.

| 스탯 | 이상적 소스 | KBO 현실 |
|------|-----------|---------|
| 구위(BallPower) | Exit Velocity 허용치 | 피장타율(SLG against)로 근사 |
| 제구(BallControl) | BB%, 존내 투구율 | BB%로 근사 가능 |
| 변화(BallBreak) | Statcast 무브먼트 데이터 | 공식 제공 제한적 |
| 구속(BallSpeed) | 실측 구속 데이터 | KBO 일부 구장 제공 |
| 체력(Stamina) | 평균 투구 수/경기 | KBO 투구 수 데이터 활용 가능 |
| 컨택(Contact) | Contact%, K% | K% 역산으로 근사 가능 |
| 파워(Power) | ISO, SLG | KBO 공개 데이터로 산출 가능 |
| 수비(Defence) | UZR, DRS | 수비율, 실책수로 근사 필요 |
| 송구(Throw) | 송구 속도 | 공식 제공 제한적 |
| 주루(Running) | Sprint Speed | 도루 성공률, 내야안타율로 근사 |
| 선구안(Eye) | BB%, O-Swing% | BB%로 근사 가능 여부 추후 확인 |

---

## 10. 투수 코스 선택 전략

### 10-1. 존(Zone) 정의 — 5×5 그리드

```
타자 시점 (우타자 기준):

     몸쪽←─────────────────────→바깥
↑높  [B11][B12][B13][B14][B15]
     [B21][ 1 ][ 2 ][ 3 ][B22]
     [B23][ 4 ][ 5 ][ 6 ][B24]
     [B25][ 7 ][ 8 ][ 9 ][B26]
↓낮  [B31][B32][B33][B34][B35]

1~9   : 스트라이크 존 (3×3 중심)
B2x   : 좌우 볼 존 (몸쪽/바깥)
B1x   : 위 볼 존 (너무 높음)
B3x   : 아래 볼 존 (너무 낮음 / dirt)
코너(B11·B15·B31·B35): 극단적 코스 — 제구 오차로만 도달
```

좌타자는 몸쪽/바깥 방향 반전 (x축 대칭).

### 10-2. 코스 선택 공식

```
zone_weight[z] = pitch_affinity[z]
               × count_modifier[z]
               × sequence_modifier[z]

최종 선택: normalize(zone_weight) → 확률적 선택
```

### 10-3. 구종 × 코스 궁합 (pitch_affinity)

| 구종 | 선호 존 | 자연 낙하 방향 |
|------|---------|-------------|
| 4심 패스트볼 | 1·2·3, B12·B13 | 직선 (속임 적음) |
| 투심/싱커 | 7·8·9, B25 | B31·B32 (낮음+몸쪽) |
| 슬라이더 | 3·6·9, B22·B24 | B22·B24·B26 (바깥) |
| 커브 | 7·8·9, B33·B34 | B33·B34·B35 (낮음~dirt) |
| 포크볼 | 8·9, B32·B33 | B33·B35 (dirt) |
| 체인지업 | 7·8·9, B34 | B34 (낮음 중앙) |

### 10-4. 볼카운트 보정 (count_modifier)

```
스트라이크 필요 (3볼):
  zone 5 및 인접 존 가중치 × 1.8
  볼 존 전체 가중치 × 0.3

유리한 카운트 (0-2, 1-2):
  자연 낙하 방향 볼 존 가중치 × 1.6  ← 유인구
  dirt 가중치 × 1.4

초구 (0-0): 기본 pitch_affinity 그대로
```

### 10-5. 배구 순서 보정 (sequence_modifier)

```
이전 코스 몸쪽 → 바깥 존 × 1.4
이전 코스 바깥 → 몸쪽 존 × 1.4
이전 코스 높음 → 낮은 존 × 1.3
이전 코스 낮음 → 높은 존 × 1.3
```

### 10-6. 속임 모델 (Deception)

타자는 공의 최종 위치가 아닌 초기 궤적을 보고 스윙을 결정한다.

```
P(swing) = P(커밋) × P(예측_스트라이크)
         + P(미커밋) × P(swing | 실제 착지 존)

P(커밋) = BallSpeed / 200 × (1 - familiarity × 0.3)
  // 빠를수록, 안 봤을수록 일찍 커밋

P(swing | 볼 존, 미커밋):
  인접 볼 (B1x 중앙·B2x·B3x 중앙): 0.20 × break_affinity
  코너 볼 (B11·B15·B31·B35):       0.10 × break_affinity

break_affinity:
  해당 존이 구종의 자연 낙하 방향 → × 1.8
  그 외                           → × 1.0
```

> 세부 수치는 밸런싱 과정에서 조정 예정.

---

## 11. 제구 시스템 (BallControl)

### 10-1. 코스 오차 모델

투수가 의도한 존(target_zone)과 실제 공이 도달하는 위치는 다르다.
BallControl 스탯이 낮을수록 오차 타원이 커진다.

```
// 제구 오차 타원 (control ellipse)
scatter_radius = base_radius × (1 - BallControl / 200)

// 참고 파일 수식 기반
major_axis = base_major - sqrt(BallControl × 0.00008)
minor_axis = major_axis × axis_ratio

// 실제 도달 위치 = 타원 내 무작위 한 점
actual_x = target_x + random_in_ellipse().x
actual_z = target_z + random_in_ellipse().z
```

### 10-2. 체력(Stamina)에 따른 제구 악화

투구 수가 쌓일수록 제구 오차가 커진다.

```
fatigue_ratio = 1 - (remaining_stamina / max_stamina)

scatter_radius_effective = scatter_radius × (1 + fatigue_ratio × 0.5)
// 체력 0% → 오차 반경 1.5배
```

### 10-3. 사구 (HBP)

실제 공의 도달 위치가 타자 몸통 영역과 겹치면 사구.

```
// 타자 몸통 영역 (우타자 기준)
batter_body:
  x: -0.50 ~ -0.90m
  z:  0.20 ~  1.80m
  y: -0.10 ~  0.50m

// 좌타자는 x 부호 반전: +0.50 ~ +0.90m

HBP 조건: actual_x, actual_z가 batter_body 범위 안에 들어오면 → 사구
```

**전략적 의미:**
- 제구 낮은 투수 + 몸쪽 코스 → 사구 위험
- 제구 좋은 투수는 몸쪽 공을 무기로 활용 가능
- 체력 소진된 투수가 안쪽 공을 노리면 위험도 증가

### 11-4. 사구 후 처리

볼넷과 동일한 강제 진루 규칙 적용 (Section 9-4 참조).

---

## 12. 주자 이동 시스템

### 12-1. 핵심 원칙

```
진루 여부 = safe_probability > risk_threshold

safe_probability : 물리 계산 (주루 속도 vs 송구 속도)
risk_threshold   : 상황 판단 (얼마나 확실해야 뛸지)
```

### 12-2. Safe Probability

```
runner_time      = arc_distance / (runner_speed × speed_factor)
fielder_throw_time = fielder_to_ball_time + FIELDING_CONFIG.pickup_delay
                   + throw_dist / throw_speed

margin           = fielder_throw_time - runner_time
safe_probability = sigmoid(margin × k)   // k = 2.5 (밸런싱 대상)
  // margin 양수 → 세이프 가능성 높음
```

### 12-3. 아크 실효 거리 및 속도 보정

**밸런싱 파라미터 (한 곳에서 관리):**
```
ARC_1B   = 4.0m   // 1루 통과 시 추가 거리
ARC_2B   = 3.0m   // 2루 통과 시 추가 거리
ARC_3B   = 2.0m   // 3루 통과 시 추가 거리
STOP_PENALTY = 0.88  // 베이스에 정지해야 할 때 속도 감소율
FATIGUE = [1.00, 0.97, 0.94, 0.90]  // 레그 인덱스별 피로 계수
```

피로는 **하나의 연속 진루 시퀀스 내에서만** 누적 (시퀀스 간 초기화).

---

**1루 단독 진루** (피로 없음, 항상 첫 번째 레그):

| 구간 | 거리 | 유효속도 | 비고 |
|------|-----|---------|------|
| HP→1B | 27.4m | ×1.00 | 오버런 |
| 1B→2B | 27.4m | ×0.88 | 정지 |
| 2B→3B | 27.4m | ×0.88 | 정지 |
| 3B→HP | 27.4m | ×1.00 | 오버런 |

**2루 진루** (레그별 피로 누적):

| 시나리오 | 레그 | 거리 | 유효속도 |
|---------|------|-----|---------|
| HP→2B | HP→1B (1루 아크) | 27.4+ARC_1B | ×1.00 |
| | 1B→2B (정지) | 27.4m | ×FATIGUE[1]×STOP_PENALTY |
| 1B→3B | 1B→2B (2루 아크) | 27.4+ARC_2B | ×1.00 |
| | 2B→3B (정지) | 27.4m | ×FATIGUE[1]×STOP_PENALTY |
| 2B→HP | 2B→3B (3루 아크) | 27.4+ARC_3B | ×1.00 |
| | 3B→HP (오버런) | 27.4m | ×FATIGUE[1] |

**3루 진루:**

| 시나리오 | 레그 | 거리 | 유효속도 |
|---------|------|-----|---------|
| HP→3B | HP→1B (1루 아크) | 27.4+ARC_1B | ×1.00 |
| | 1B→2B (2루 아크) | 27.4+ARC_2B | ×FATIGUE[1] |
| | 2B→3B (정지) | 27.4m | ×FATIGUE[2]×STOP_PENALTY |
| 1B→HP | 1B→2B (2루 아크) | 27.4+ARC_2B | ×1.00 |
| | 2B→3B (3루 아크) | 27.4+ARC_3B | ×FATIGUE[1] |
| | 3B→HP (오버런) | 27.4m | ×FATIGUE[2] |

**인사이드 더 파크 홈런:**

| 레그 | 거리 | 유효속도 |
|------|-----|---------|
| HP→1B (1루 아크) | 27.4+ARC_1B | ×1.00 |
| 1B→2B (2루 아크) | 27.4+ARC_2B | ×FATIGUE[1] |
| 2B→3B (3루 아크) | 27.4+ARC_3B | ×FATIGUE[2] |
| 3B→HP (오버런) | 27.4m | ×FATIGUE[3] |

### 12-4. Risk Threshold (상황 판단)

```
base_threshold = 0.55  // 밸런싱 대상

상황 보정:
  2아웃:                     -0.15  (공격적 — 이닝 마지막 찬스)
  2점 이상 지는 중 + 7회 이후: -0.12  (공격적 — 점수 필요)
  이기는 중 + 7회 이후:       +0.10  (보수적 — 아웃 방지)
  0아웃 + 3루 주자:           +0.15  (보수적 — 홈 아웃 회피)
```

### 12-5. 태그업 (Tag-up)

포구 완료 순간부터 동일 로직 적용:

```
runner_time        = dist(현재 베이스 → 다음 베이스) / (runner_speed × speed_factor)
fielder_throw_time = reaction_delay + dist(포구 위치 → 목표 베이스) / throw_speed

→ safe_probability + risk_threshold 동일 판단
```

### 12-6. 다중 주자 처리

```
앞 주자부터 순서대로 판단
  → 앞 주자가 멈추면 뒤 주자도 같은 베이스에 설 수 없으므로 강제 정지
  → 강제 진루(볼넷/사구) 시 예외
```

---

## 13. 이닝 / 아웃 / 점수 관리

### 13-1. 경기 구조

```
경기 = 9이닝 × 2반이닝 (초/말)
  초(top)    = 원정팀 공격
  말(bottom) = 홈팀 공격

반이닝 종료: 아웃 3개

연장:
  9회 종료 후 동점 → 연장 진행
  MAX_INNINGS = 12   // 밸런싱 대상 (KBO 기준)
  MAX_INNINGS 회 말 종료 후 동점 → 무승부
```

### 13-2. 아웃 유형 (각 섹션 참조)

| 아웃 유형 | 섹션 |
|----------|------|
| 삼진 (스윙 미스) | Section 7 |
| 낫아웃 실패 | Section 8 |
| 플라이볼 포구 | Section 5 |
| 땅볼 → 1루 송구 | Section 6-3 |
| 주자 포스아웃 / 태그아웃 | Section 12 |

### 13-3. 득점 처리 및 3아웃 타이밍

```
주자가 홈플레이트 도달 → score_time 기록 후 득점 후보 등록

3번째 아웃 확정 시:

  [포스아웃 OR 타자 1루 도달 전 아웃]
    → 타이밍 무관하게 득점 무효

  [비강제 태그아웃]
    → score_time < out_time  → 득점 유효
    → score_time >= out_time → 득점 무효

반이닝 종료 후 유효 득점만 점수판에 반영
```

**비강제 태그아웃 예시:**
```
2아웃, 3루 주자
  타자 안타로 1루 안착 (히트 확정)
  3루 주자 홈 쇄도 → score_time = T1
  타자가 2루 시도하다 태그아웃 → out_time = T2

  T1 < T2 → 득점 유효  (1루 안착이 포스아웃 아님)
```

### 13-4. 끝내기 (Walk-off)

```
말 공격 중 홈팀이 앞서는 득점 발생
  → 득점 유효성 확인 후 즉시 경기 종료
  → 9회 말 이후 모든 연장 말에도 동일 적용
```

---

## 14. 투수 체력 (Stamina) 소모 및 강판

### 14-1. 소모 파라미터 (한 곳에서 관리)

```
STAMINA_CONFIG = {
  fatigue_per_pitch:    0.7,    // 투구당 기본 소모량 (밸런싱 대상)
  pitch_type_modifier: {        // 구종별 소모 배율
    fastball:   1.0,
    breaking:   1.1,            // 변화구는 팔에 부담이 더 큼
    off_speed:  0.9,
  },
  relief_threshold:     0,      // 강판 기준 (이하 도달 시)
}
```

### 14-2. 소모 공식

```
// 매 투구 후
remaining_stamina -= fatigue_per_pitch × pitch_type_modifier[pitch_type]

// 현재: fatigue_per_pitch × 1.0으로 단순 동작
// 추후: pitch_type_modifier 값만 조정하면 구종별 차등 적용 가능
```

### 14-3. 강판 조건

```
타석 시작 전 체크:
  remaining_stamina <= relief_threshold → 강판

강판 타이밍: 진행 중인 타석이 종료된 직후
  (타석 도중 강판은 없음)
```

### 14-4. 제구 악화 연동

체력 소진에 따른 제구 오차 증가는 Section 11-2 참조.

---

## 15. 도루 (Stolen Base)

### 15-1. 타이밍 모델

Section 12 주자 이동과 동일한 safe_probability 구조:

```
runner_time = (base_distance - lead_distance) / runner_speed

throw_time  = delivery_time          // 투수 구속 기반 (홈까지 이동 시간)
            + catcher_reaction       // 포수 포구→송구 준비
            + throw_dist / throw_speed

margin           = throw_time - runner_time
safe_probability = sigmoid(margin × k)
```

**밸런싱 파라미터:**
```
STEAL_CONFIG = {
  lead_base:        3.0,    // 기본 리드 거리 (m)
  lead_per_running: 2.0,    // Running 100 기준 추가 리드 (m)
  catcher_reaction_base: 0.8,   // 포수 반응 기본값 (s)
  catcher_reaction_def:  0.2,   // Defence 100 시 최대 단축 (s)
}

lead_distance      = lead_base + (Running / 100) × lead_per_running
catcher_reaction   = catcher_reaction_base - (Defence / 100) × catcher_reaction_def

throw_dist:
  1루→2루: 38.8m
  2루→3루: 27.4m
```

### 15-2. 도루 시도 결정

```
P(steal_attempt) = base_rate
                 × feasibility_modifier
                 × situation_modifier

feasibility_modifier = f(runner_speed - avg(BallSpeed, C_Throw))
  // 러너가 충분히 빠를 때만 시도

situation_modifier:
  볼카운트 1-0, 2-0: ×1.4  (투수가 스트라이크 던질 확률 높음)
  볼카운트 0-2:      ×0.4  (타자 스윙 많아 포수 집중)
  2아웃:             ×0.7  (이닝 종료 리스크)
  득점권 필요 상황:  ×1.3  (공격적으로)
```

### 15-3. 견제 (Pickoff)

> **기획 개선 예정** — 메이저리그 견제 횟수 제한 시스템 추가 예정.
> 설정에서 on/off 가능 (KBO 규칙 vs MLB 규칙 선택).
> 현재는 간략한 구조만 기록.

```
P(견제 시도) = 2 + sqrt(runner_Running) × 0.18³
  // 러너가 빠를수록 투수가 더 자주 견제

P(견제 성공) = pitcher_OVR_factor - runner_speed_factor

견제 실패 효과:
  해당 타석의 도루 시도 확률 × 0.9
```

### 15-4. 태그 처리 시간

도루 판정에서 포스아웃과 태그아웃의 처리 시간이 다르다.

```
포스아웃: tag_time = 0        (베이스 터치만으로 완료)
태그아웃: 공 도착 후 추가 소요
  TAG_CONFIG = {
    base_tag_time: 0.15,     // 기본 태그 처리 시간 (s) (밸런싱 대상)
    tag_reduction: 0.05,     // Defence 100 시 최대 단축 (s)
  }
  tag_time = base_tag_time - (Defence / 100) × tag_reduction
```

out_time = throw_arrive_time + tag_time

### 15-5. 더블 스틸 (Double Steal)

**유형 1: 1+2루 더블 스틸 (→ 2루+3루)**

```
시도 조건:
  P(2루→3루 safe) > threshold           // 선행 주자가 핵심 조건
  AND P(1루→2루 safe) > lower_threshold  // 후행 주자도 최소 가능성

양쪽 주자 동시 출발

포수 결정: 3루 우선 원칙
  P(out_at_3B) = 선행 주자(2루→3루) 저지 확률 (tag_time 포함)
  P(out_at_2B) = 후행 주자(1루→2루) 저지 확률 (tag_time 포함)

  if P(out_at_3B) + DOUBLE_STEAL_CONFIG.throw_3B_bias ≥ P(out_at_2B):
    → 3루 송구  (기본값: 3루 우선)
  else:
    → 2루 송구  (2루가 명확히 유리할 때만)

결과:
  3루 송구 → 선행 주자 safe_probability 판정
             후행 주자는 2루 세이프 (무송구)
             단, 3루수가 후행 주자 2루 미도달 확인 후 중계 가능:
               relay_time = 3루수 반응 + dist(3B→2B) / throw_speed + tag_time
               → safe_probability 재계산

  2루 송구 → 후행 주자 safe_probability 판정
             선행 주자는 3루 세이프 (무송구)
```

---

**유형 2: 1+3루 더블 스틸**

```
시도 조건:
  P(1루→2루 safe) > threshold       // 1루 주자 성공 가능성 필요
  (3루 주자는 포수 송구 여부에 따라 별도 결정)
```

**공통 계산: cut_relay_time**

```
// 포수가 2루로 던질 때 중계→홈 총 소요 시간

cut_relay_time =
    dist(home → 2루수 위치) / catcher_throw_speed   // 포수→2루수까지
  + FIELDING_CONFIG.relay_reaction                   // 2루수 반응 시간
  + dist(2루수 위치 → home) / fielder_throw_speed   // 2루수→홈 중계
  + tag_time                                        // 홈 태그 처리

runner_3B_time = (27.4 - lead_3B) / runner_speed_3B

P(홈 쇄도 성공) = sigmoid((cut_relay_time - runner_3B_time) × k)
```

**[1단계] 포수 결정: 던질지 말지**

```
if P(홈 쇄도 성공) > DOUBLE_STEAL_CONFIG.catcher_hold_threshold:
  포수 → 홈 방어 (송구 안 함)    // 위험 — 던지면 3루 주자 득점 가능성 높음
  → 1루 주자 2루 무조건 세이프
else:
  포수 → 2루 송구
```

**[2단계] 포수가 2루 송구 시: 3루 주자 결정**

```
// 3루 주자도 동일한 P(홈 쇄도 성공)으로 독립 판단

if P(홈 쇄도 성공) > DOUBLE_STEAL_CONFIG.runner_go_threshold:
  3루 주자 뛴다 →

    2루수: 공을 받자마자 홈으로 중계 송구
      (2루 도착 처리 없이 중간에서 끊어 홈으로)

    홈 판정:
      out_time  = cut_relay_time
      safe_time = runner_3B_time
      → safe_probability로 판정

    1루 주자: 2루수가 홈으로 던졌으므로 2루 세이프

else:
  3루 주자 안 뜀 →              // 위험 — 포수가 던졌지만 쇄도 포기
    일반 2루 도루 판정 (safe_probability + tag_time)
    3루 주자 3루 유지
```

### 15-6. 더블 스틸 밸런싱 파라미터

```
DOUBLE_STEAL_CONFIG = {
  // 유형 1 (1+2루)
  throw_3B_bias:          0.10,   // 3루 우선 송구 바이어스
                                  // P(out_3B) + bias ≥ P(out_2B) 이면 3루 송구

  // 유형 2 (1+3루)
  catcher_hold_threshold: 0.50,   // 포수 송구 포기 기준
                                  // P(홈 쇄도 성공) > 이 값 → 안 던짐
  runner_go_threshold:    0.45,   // 3루 주자 쇄도 결행 기준
                                  // P(홈 쇄도 성공) > 이 값 → 뛴다
  // 공통
  threshold:              0.55,   // 더블 스틸 시도 기준 (선행 주자)
  lower_threshold:        0.35,   // 후행 주자 최소 가능성 기준

  // relay_reaction → FIELDING_CONFIG.relay_reaction 참조
}
```

> 모든 수치는 밸런싱 대상. 한 곳에서 일괄 수정.

### 15-7. 홈 스틸 (보류)

> 구현 보류 — 방향만 기록.
> 3루 주자가 투수 모션을 읽고 홈으로 뛰는 플레이.
> 1+3루 더블 스틸 2루 송구 시의 홈 쇄도 로직과 동일한 타이밍 모델 사용 예정.

---

## 17. 인필드 플라이 룰 (Infield Fly Rule)

### 17-1. 발동 조건

```
아래 조건을 모두 충족할 때 심판 선언:

  outs < 2                              // 0아웃 or 1아웃
  AND (1루+2루 주자 있음 OR 만루)
  AND launch_angle > INFIELD_FLY_CONFIG.min_launch_angle   // 라인 드라이브 제외
  AND predicted_landing_dist < INFIELD_FLY_CONFIG.max_distance  // 인필드 내 착지
  AND 예상 착지점 페어 영역               // 파울 예상이면 미선언
```

> 번트 팝업도 조건 충족 시 인필드 플라이 적용 (Section 16-3 팝업 분기 연동).

### 17-2. 선언 효과

```
인필드 플라이 선언 → 타자 즉시 아웃 (수비 포구 성공/실패 무관)
```

### 17-3. 수비 포구 결과별 처리

**포구 성공:**
```
일반 플라이볼과 동일
  → 주자: 포구 완료 시점부터 태그업 가능 (Section 12-5)
```

**포구 실패 (공이 땅에 떨어짐):**
```
공 → 페어 땅볼로 처리
주자:
  진루 의무 없음 (타자 이미 아웃 → 포스아웃 상황 없음)
  진루 시도 가능 → 태그아웃 대상 (tag_time 포함)
수비:
  공 잡고 베이스 터치 or 주자 태그 가능 → Section 12 동일 판정
```

### 17-4. 밸런싱 파라미터

```
INFIELD_FLY_CONFIG = {
  min_launch_angle:  50,    // 인필드 플라이 최소 발사각 (°) — 미만이면 라인 드라이브
  max_distance:      40.0,  // 인필드 플라이 최대 착지 거리 (m, 홈플레이트 기준)
}
```

---

## 16. 번트 (Bunt)

### 16-1. 번트 유형

| 유형 | 설명 | 주자 출발 시점 |
|------|------|-------------|
| 희생번트 (Sacrifice) | 타자 아웃 감수, 주자 진루 목표 | 타구 확인 후 |
| 번트 히트 (Bunt Hit) | 타자도 살아나기 시도 | 타구 확인 후 |
| 스퀴즈 (Squeeze) | 3루 주자 홈 쇄도 + 번트 | 투구와 동시에 출발 |

### 16-2. AI 번트 결정

```
희생번트 시도 조건:
  아웃 수 < 2                    // 2아웃에서는 번트 비효율
  AND 주자 있음 (1루 or 2루)
  AND situation_modifier 충족    // 이닝, 점수 차, 전략 등

번트 히트 시도 조건:
  주자 있음
  AND Running > bunt_hit_speed_threshold   // 발이 빠른 타자만 유효

스퀴즈 시도 조건:
  아웃 수 < 2
  AND 3루 주자 존재
  AND P(정상 타격 득점) < squeeze_threshold  // 점수가 절실할 때
```

### 16-3. 번트 시도 판정

```
P(contact) = (Contact / 100) × BUNT_CONFIG.contact_modifier

실패 유형 (컨택 실패):
  P(popup) = (1 - Contact/100) × BUNT_CONFIG.popup_chance
    → fair territory 팝업 → Section 5 플라이볼 처리 (인필드 플라이룰 → Section 17)
    → foul 팝업           → 파울 처리 (Section 9 카운트 규칙 적용)

  나머지 → 스윙 미스 (스트라이크 +1, 일반 삼진 규칙 동일)
  파울 번트 + 2스트라이크 → 삼진
```

### 16-4. 타구 방향 및 수비 처리

**타구 생성:**

```
타구 방향: AI 선택 — 1루 라인 or 3루 라인

bunt_distance = BUNT_CONFIG.base_distance
              × (1 - (Contact/100) × BUNT_CONFIG.contact_range)
              + uniform(-BUNT_CONFIG.random_spread, +BUNT_CONFIG.random_spread)
  // Contact 높을수록 짧게 (수비 처리 어렵게)
  // Contact 낮을수록 길어짐 (수비 처리 쉬워짐)
```

**수비 배분:**

```
3루 라인:
  bunt_distance ≤ BUNT_CONFIG.catcher_range_3B → 포수 처리
  그 외                                          → 3루수 처리

1루 라인:
  bunt_distance ≤ BUNT_CONFIG.catcher_range_1B → 포수 처리
  그 외:
    uniform(0, 1) < BUNT_CONFIG.pitcher_field_prob → 투수 처리
    그 외                                           → 1루수 처리
```

**수비수 결정 후 송구 판단 (희생번트 / 번트 히트):**

```
수비수는 리드 주자 아웃 가능성을 먼저 계산:

P(out_lead) = sigmoid((throw_time_to_lead_base - runner_time_to_lead_base) × k)
P(out_1B)   = sigmoid((throw_time_to_1B - batter_time_to_1B) × k)

if P(out_lead) > P(out_1B):
  → 리드 주자 베이스로 송구
else:
  → 1루 송구 (타자 아웃)

송구 판정: Section 6-3 (땅볼 처리)와 동일 로직 적용
```

**번트 히트 추가 조건:**

```
번트 히트 성공 = 타자 1루 세이프
  // 수비수가 1루 송구 시 → Section 6-3 동일
  // 수비수가 리드 주자 송구 선택 시 → 타자 1루 무조건 세이프
```

### 16-5. 스퀴즈 플레이

**투구 시 3루 주자 동시 출발 (suicide squeeze):**

```
3루 주자 홈 판정:
  runner_time = (base_distance_3B - lead_3B) / runner_speed

// 번트 성공 시: 수비수가 공을 잡고 홈 송구
  fielder_throw_time = fielder_to_ball_time + BUNT_CONFIG.pickup_delay
                     + dist(수비 위치 → home) / (Throw × throw_speed_factor)
                     + tag_time

  → safe_probability = sigmoid((fielder_throw_time - runner_time) × k)
```

**번트 실패 시 (스윙 미스):**

```
포수가 공 포구 → 3루 주자 이미 달리는 중 → 귀루 불가

홈 태그 판정:
  runner_remaining_time = remaining_dist / runner_speed
    // 이미 달리던 거리 제외
  catcher_tag_time = tag_time    // 공 이미 보유 중
  → safe_probability 판정 (거의 아웃)
```

**팝업 번트 (스퀴즈 중):**

```
공이 뜬 경우 → 타자 아웃 (포구)
3루 주자는 귀루 필요:
  귀루 성공 여부 = Section 12-5 태그업과 동일 로직
```

### 16-6. 밸런싱 파라미터

```
BUNT_CONFIG = {
  contact_modifier:     0.85,   // 일반 컨택 대비 번트 컨택 보정
  popup_chance:         0.12,   // Contact 낮을 때 팝업 기본 확률
  base_distance:        6.0,    // 번트 타구 기본 거리 (m)
  contact_range:        0.4,    // Contact 높을수록 최대 단축 비율
  random_spread:        1.5,    // 타구 거리 랜덤 편차 (m)
  catcher_range_3B:     3.5,    // 3루 라인 포수 처리 기준 거리 (m)
  catcher_range_1B:     3.0,    // 1루 라인 포수 처리 기준 거리 (m)
  pitcher_field_prob:   0.45,   // 1루 라인 번트 시 투수 처리 확률
  pickup_delay:         0.25,   // 번트 타구 픽업 딜레이 (s)
  bunt_hit_speed_threshold: 65, // 번트 히트 시도 최소 Running 스탯
  squeeze_threshold:    0.35,   // 정상 타격 득점 확률 이하 시 스퀴즈 고려
}
```

---

## 18. 선수 교체 (Substitution)

### 18-1. 교체 유형

| 유형 | 설명 | 투입 타이밍 |
|------|------|-----------|
| 대타 (Pinch Hitter) | 타자 교체 | 타석 시작 전 |
| 대투 (Relief Pitcher) | 투수 교체 | 이닝 사이 or 이닝 중 (타자 간) |
| 대주자 (Pinch Runner) | 주자 교체 | 출루 직후 |

### 18-2. 공통 규칙

```
재출전 불가: 한 번 교체된 선수 → inactive 상태, 동일 경기 재출전 불가
```

### 18-3. 투수 교체 규정 옵션

```
RULES_CONFIG = {
  three_batter_minimum: true,  // 3타자 최소 상대 규정 on/off
                               // (KBO·MLB 모두 적용 중)
}

three_batter_minimum = true 시:
  투수는 현재 타자 포함 최소 3명 상대 후 교체 가능
  예외: 3명 채우기 전 이닝 종료 시 교체 허용
```

### 18-4. AI 대타 결정

```
// 현 타자 대비 대타 후보 스코어 계산
ph_score(batter) = batter.Contact × w_contact + batter.Power × w_power
  w_contact, w_power: 상황에 따라 가중치 조정
    (득점권 주자 있음 → Power 가중치 ↑)

대타 투입 조건:
  ph_score(후보) > ph_score(현 타자) + SUB_CONFIG.ph_score_gap
  AND inning >= SUB_CONFIG.ph_min_inning          // 너무 이른 교체 방지
  AND (득점권 주자 있음 OR close_game)
  AND 벤치에 사용 가능한 대타 존재
```

### 18-5. AI 대투 결정

**강제 강판 (체력 소진):**

```
// Section 14-3과 연동
remaining_stamina <= STAMINA_CONFIG.relief_threshold → 강제 강판
  (타석 종료 직후 즉시 교체)
```

**전략적 강판:**

```
아래 조건 중 하나 이상 충족 시 교체 검토:

  remaining_stamina / max_stamina <= SUB_CONFIG.strategic_stamina_ratio
    // 예: 0.25 → 체력 25% 이하면 교체 검토 시작

  OR consecutive_hits >= SUB_CONFIG.pitching_change_hits
    // 연속 피안타 N개 이상

  OR (runners_in_scoring_position
      AND unfavorable_matchup              // 좌타자 vs 우투수 등 불리한 좌우
      AND inning >= SUB_CONFIG.late_game_inning)

  AND 벤치에 사용 가능한 투수 존재
```

**새 투수:**

```
교체 투입 시 remaining_stamina = max_stamina  // 체력 풀 상태로 시작
three_batter_minimum 적용 시 카운터 초기화
```

### 18-6. AI 대주자 결정

```
대주자 투입 조건:
  출루 직후
  AND current_runner.Running < SUB_CONFIG.pr_running_threshold
  AND 도루 or 추가 진루 상황 기대
    (볼카운트 유리, 좌완 투수, 득점 필요 상황 등)
  AND 벤치에 Running 높은 선수 존재
```

### 18-7. 밸런싱 파라미터

```
SUB_CONFIG = {
  // 대타
  ph_score_gap:         5,     // 대타 투입 최소 스코어 차이 (밸런싱 대상)
  ph_min_inning:        6,     // 대타 투입 최소 이닝

  // 대투 — 전략적
  strategic_stamina_ratio:    0.25,  // 체력 잔량 비율 이하 시 교체 검토
  pitching_change_hits:       3,     // 연속 피안타 기준
  late_game_inning:           7,     // 전략 교체 검토 시작 이닝

  // 대주자
  pr_running_threshold:       50,    // 대주자 투입 기준 Running 스탯
}
```

> `STAMINA_CONFIG.relief_threshold` (Section 14)와 `SUB_CONFIG.strategic_stamina_ratio`는
> 역할이 다름: 전자는 강제 강판 하드플로어, 후자는 전략 교체 검토 시작 기준.

---

## 19. 희생플라이 (Sacrifice Fly)

### 19-1. 개요

희생플라이는 별도 로직이 아니라 기존 시스템의 조합으로 자연스럽게 처리된다.

```
외야 플라이볼 포구 (Section 5)
  → 모든 주자 태그업 판단 (Section 12-5)
  → 득점 발생 시 SAC 기록 (Section 13)
```

### 19-2. 기록 처리

```
타자: 아웃 처리
  타석 기록 없음 → 타율/출루율 분모 미포함
  SAC(F) 기록

득점한 주자가 있을 때만 SAC(F)로 기록.
득점 없이 주자가 진루만 한 경우 → 일반 플라이아웃 기록.
```

### 19-3. 태그업 적용 범위

모든 주자가 태그업 가능. 어느 주자가 실제로 뛸지는 `safe_probability > risk_threshold`로 판단.

```
3루 주자 → 홈 태그업   (가장 흔한 케이스)
2루 주자 → 3루 태그업  (외야 깊은 타구일 때)
1루 주자 → 2루 태그업  (매우 드문 케이스 — 깊고 방향이 유리할 때)
```

복수 주자 동시 태그업 → Section 12-6 (앞 주자 우선 처리).

### 19-4. 포구 위치의 영향

포구 위치가 태그업 성공 여부를 자연스럽게 결정한다.

```
fielder_throw_time = dist(포구 위치 → 목표 베이스) / (Throw × throw_speed_factor)

얕은 플라이 (포구 위치 가까움):
  → fielder_throw_time 짧음
  → 3루 주자도 margin 얕아짐 → 진루 포기 가능
  → 2루·1루 주자는 거의 뜰 수 없음

깊은 플라이 (포구 위치 멈):
  → fielder_throw_time 길어짐
  → 2루·1루 주자까지 태그업 가능성 생김
```

별도 파라미터 없음 — 거리 계산이 자동으로 처리.

### 19-5. 송구 경로에 따른 후속 주자 태그업 가능성

외야수의 1차 송구 목표(주로 홈)에 따라 후속 주자의 태그업 난이도가 달라진다.

**홈 직접 송구 (중계 없음):**
```
2루수·3루수가 베이스를 비워 중계 위치로 이동
  → 2루·3루 커버 수비수 없음
  → 후속 주자(2루→3루, 1루→2루) 태그업 시
    fielder_throw_time = ∞ (사실상 무송구)
    → safe_probability ≈ 1.0
```

**중계수가 공을 끊어 2루 or 3루로 전환:**
```
중계수 결정: 홈 vs 후속 주자 베이스 중 아웃 확률 더 높은 쪽으로 송구
  cut_target = argmax(P(out_at_home), P(out_at_2B), P(out_at_3B))

전환된 베이스가 후속 주자의 목표 베이스와 같으면:
  → 일반 fielder_throw_time 계산 적용 (Section 12-5)
  → 해당 베이스에서 safe_probability 판정
```

### 19-6. 2아웃 시 득점 타이밍 판정

플라이 포구가 2번째 아웃일 때, 태그업 도중 또 다른 주자가 아웃되면 Section 13-3 타이밍 로직 적용.

```
예시:
  2아웃, 2·3루 주자
  플라이 포구 → 3번째 아웃? NO (이미 2아웃이 있었다면... 포구가 3번째 아웃)
    → 이닝 종료, 득점 불인정

  1아웃, 2·3루 주자
  플라이 포구 → 2번째 아웃
  3루 주자 홈 태그업 → score_time = T1
  2루 주자 3루 태그업 시도 → 중계 송구로 3루 아웃 → out_time = T2

  T1 < T2 → 득점 유효, 이닝 종료 (Section 13-3 비강제 태그아웃 동일 처리)
  T1 ≥ T2 → 득점 무효, 이닝 종료
```

> 플라이 포구 자체가 3번째 아웃이면 태그업 성공 여부와 무관하게 득점 불인정.

---

## 20. 지명타자 & 투웨이 선수 규칙

### 20-1. 규칙 설정

```
RULES_CONFIG = {
  dh:           true,   // 지명타자 규정 on/off (기본 on)
  ohtani_rule:  true,   // 투웨이 선수 예외 규정 on/off (기본 on)
  three_batter_minimum: true,  // 3타자 최소 상대 규정 (Section 18-3)
}
```

### 20-2. DH 규칙

```
dh = true:
  투수는 타순에 포함되지 않음
  라인업 = 야수 8명 + DH 1명 (총 9타순)

dh = false:
  투수도 타순에 포함
  라인업 = 야수 8명 + 투수 1명 (총 9타순)
  투수 타석이 돌아오면 대타 가능 (Section 18 선수 교체)
```

### 20-3. 투웨이 선수 자격

별도 플래그 없이 포지션 목록으로 자동 판단.

```
is_two_way(player) =
  player.positions.includes('P')
  AND player.positions.filter(p => p !== 'P').length > 0
```

### 20-4. 오타니 룰 (Two-Way Player Exception)

`ohtani_rule = true` 시 적용.

**투수로 출전하는 경기:**

```
투웨이 선수가 선발 투수로 출전
  → DH 슬롯을 본인이 점유 (투수 + DH 동시)
  → 팀은 별도 DH 없이 투웨이 선수가 두 역할 수행

마운드를 떠난 후 (강판):
  a. DH 지속: 타격만 계속 (DH 슬롯 유지)
  b. 야수 전환: 가능 포지션 중 하나로 이동
               → 해당 포지션 기존 선수는 퇴장 or 다른 포지션으로 이동
  (감독 모드: 선택 / 시뮬 모드: Section 20-6 AI 규칙)

새로 올라온 투수 (일반 투수):
  → 타순 없음 (DH 슬롯은 투웨이 선수가 계속 점유)
```

**투수로 출전하지 않는 경기:**

```
DH로 출전: 타격만 담당
야수로 출전: 가능 포지션 중 하나 배정, 타격 + 수비 모두
```

### 20-5. 투웨이→투웨이 교체 옵션

마운드에 있던 투웨이 선수(A)가 또 다른 투웨이 선수(B)로 교체될 때.

| 옵션 | 설명 |
|------|------|
| **옵션 1** | B는 투수만 / A는 DH로 타격 지속 |
| **옵션 2** | A 완전 퇴장 / B가 투수 + DH 모두 |
| **옵션 3** | A가 야수 포지션으로 이동 (그 자리 기존 선수 퇴장) / B가 투수 + DH |

감독 모드: 3가지 중 선택
시뮬레이션 모드: Section 20-6 AI 규칙 적용

### 20-6. 시뮬레이션 모드 AI 결정

**우선순위:**

```
// 1순위: 옵션 3 가능 여부 체크
viable_positions = A.positions.filter(p => p !== 'P')
for pos in viable_positions:
  current_fielder = lineup.get_fielder(pos)
  if A.Defence > current_fielder.Defence + TWO_WAY_CONFIG.option3_defence_gap:
    AND B의 타격 스탯 ≥ TWO_WAY_CONFIG.option3_min_bat:
      → 옵션 3 선택 (A 야수 전환, B DH)

// 2순위: 옵션 1 vs 2
a_bat = A.Contact × w_contact + A.Power × w_power
b_bat = B.Contact × w_contact + B.Power × w_power

if a_bat > b_bat + TWO_WAY_CONFIG.bat_gap_threshold:
  → 옵션 1 (A의 배트 가치가 더 높음)
else:
  → 옵션 2 (B에게 DH 넘김)
```

**상황 보정:**

```
접전 + 7회 이후:
  w_power ↑  (장타 한 방의 가치 증가)

크게 앞서는 중:
  option3_defence_gap 임계치 낮춤  (수비 안정 선호)
```

### 20-7. 밸런싱 파라미터

```
TWO_WAY_CONFIG = {
  option3_defence_gap:  5,    // 옵션 3 선택 최소 수비력 차이
  option3_min_bat:      50,   // 옵션 3 시 B의 최소 타격 스탯 (Contact+Power 평균)
  bat_gap_threshold:    8,    // 옵션 1/2 결정 최소 타격 스탯 차이
  w_contact:            0.5,  // 타격 스코어 컨택 가중치
  w_power:              0.5,  // 타격 스코어 파워 가중치
}


