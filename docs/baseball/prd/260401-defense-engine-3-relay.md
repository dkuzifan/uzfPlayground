---
title: "수비 엔진 #3 — 중계 플레이 & 기본 공짜 진루"
date: 2026-04-01
owner: @dkuzifan
status: draft
series: 수비 엔진 (Defense Engine Module)
---

> **수비 엔진 시리즈**: `#1 포구` ✅ → `#2 송구` ✅ → **`#3 중계 플레이`** → `#3-b 송구 방향 판단` → `#4 병살` → `#5 태그업` → `#6 에러` → `#7 시프트`

---

## Context

### 현재 문제

**#2(송구 판정)** 완료 후 두 가지 문제가 미해결 상태로 남아 있다.

#### 문제 1 — 후속 주자 공짜 진루 누락

`resolveLeadingRunner`는 "가장 앞선 주자(leading runner)" 한 명에게만 실제 송구를 모델링한다.
수비수가 홈으로 던지는 사이 1루 주자는 **2루로 무조건 진루**해야 하지만, 현재 코드는 1루 주자를 그대로 1루에 둔다.

```
현재: 2루 주자 → 홈 판정, 1루 주자 → 1루 그대로 (BUG)
기대: 2루 주자 → 홈 판정, 1루 주자 → 2루 FREE
```

개념: 수비수가 홈으로 던진 순간 **2루수는 베이스에 있지만 공이 없다**.
태그나 포스아웃은 공이 있어야만 가능하므로, 1루 주자는 2루를 공짜로 얻는다.

#### 문제 2 — 중계 플레이 없음

현재 `resolveLeadingRunner`는 외야수 → 베이스 직선 송구만 계산한다.
실측 거리:

| 외야수 기본 위치 | 홈까지 거리 |
|----------------|------------|
| LF (−33, 73) | ≈ 80m |
| CF (0, 88) | ≈ 88m |
| RF (33, 73) | ≈ 80m |

외야수 어깨 수준에 따라 이 거리를 직접 던질 수 없거나, 던질 수 있어도 중계가 더 빠른 경우가 있다.
현재 코드는 그 판단을 아예 하지 않아 주자가 항상 safe에 유리하다.

---

## Goals / Non-Goals

### Goals (MVP)

**G1. 후속 주자 공짜 진루 (Free Advance)**

수비수의 실제 송구가 향한 베이스 외의 베이스에 있는 주자는 **+1베이스 무조건 전진**.
(수비수는 있지만 공이 오지 않으므로 태그·포스아웃 불가)

| 상황 | 판정 주자 | 공짜 진루 주자 |
|------|----------|--------------|
| 단타, 1·2루 | 2루 주자 → 홈 (contested) | 1루 주자 → 2루 FREE |
| 단타, 1루만 | 1루 주자 → 3루 (contested) | 없음 |
| 2루타, 1루 | 1루 주자 → 홈 (contested) | 없음 |

- 공짜 진루는 항상 +1베이스, 추가 도전 없음
- 도전적 진루(+2베이스 시도, 송구 방향 판단 등)는 **#3-b**에서 구현
- 타자 본인의 추가 진루(`resolveBatterAdvance`)는 현행 독립 평가 모델 유지

**G2. 직접 송구 가능 여부 판단 (`maxDirectDist`)**

어깨(Throw 스탯)에 따라 경쟁적 직접 송구로 아웃을 잡아낼 수 있는 최대 거리를 산출.
실세계 기준: Throw ~90 수준(이치로급)의 기록이 ~72–73m.

```
maxDirectDist(throw) = 41.5 × ln(throw) − 106   [m]
```

"직접 송구"는 바운드 포함 — 중계수를 거치지 않는 모든 송구.

| Throw | 최대 직접 거리 |
|-------|-------------|
| 30 (최솟값) | 35m |
| 50 | 56m |
| 70 | 70m |
| 80 | 76m |
| 90 | 81m ← LF/RF→홈 직접 가능 |
| 100 | 85m |
| 110 | 89m ← CF→홈 직접 가능 |
| 120 | 93m |

저스탯 5포인트 ≈ 5m 차이, 고스탯 5포인트 ≈ 2m 차이 (로그 기반 감쇠).

**G3. 중계 사용 여부 결정 (`shouldUseRelay`)**

두 가지 조건을 모두 만족해야 직접 송구. 하나라도 실패하면 중계 사용:

```
can_reach   = dist_to_target <= maxDirectDist(throw_stat)
direct_faster = t_direct < t_relay

use_relay = !can_reach || !direct_faster
```

- `t_direct = t_fielding + dist_to_target / throw_speed`
- `t_relay = t_fielding + dist_to_relay / throw_speed_OF + 0.8 + dist_relay_to_target / throw_speed_relay`

**G4. 중계수 선택 (`selectRelayMan`)**

```
fielder_x > 0  (우측: RF, 우중간 CF)  →  SS
fielder_x ≤ 0  (좌측: LF, 좌중간 CF)  →  2B
```

`defenceLineup`에서 해당 포지션 Player를 탐색. 없으면 dummy (Throw 70) 사용.

**G5. 중계 위치 산출 (`calcRelayPos`)**

```
relay_pos = lerp(fielder_pos, target_base, 0.45)
```

외야수와 목표 베이스 사이 45% 지점 (중계수가 외야수 방향으로 약간 더 나가는 경험칙).

**G6. 중계 플레이 판정 (`resolveRelayThrow`)**

```
t_to_relay     = dist(fielder_pos, relay_pos) / throw_speed_OF
t_reaction     = 0.8s  (중계수 수신 + 방향전환 + 투구, 고정)
t_from_relay   = dist(relay_pos, target_base) / throw_speed_relay
t_total        = t_fielding + t_to_relay + t_reaction + t_from_relay

margin = t_total − t_runner
P_safe = sigmoid(margin, 0.5)
```

이후 동일한 `sigmoid` 로직으로 safe/out 판정.

---

### Non-Goals

- **#3-b**: 도전적 진루(Running+judgment 기반 +2베이스 시도), 송구 방향 판단(decideThrowTarget), 추가 송구(secondaryThrow)
- **#4 병살**, **#5 태그업**, **#6 에러**, **#7 시프트**
- **중계수 실제 이동 거리 모델링**: 중계 위치만 lerp로 계산, 중계수의 이동 지연 없음
- **3루타 중계 플레이**: 3루타는 주자 3루 완주로 처리
- **판단력(judgment) 스탯**: 플레이어 스탯 설계 시 추가 예정 (`player.stats.judgment ?? player.stats.defence` 패턴으로 전환 대비)

---

## Success Definition

- 1·2루 단타에서 1루 주자가 2루로 공짜 진루되는 것이 시뮬레이션에서 관찰된다
- Throw 스탯이 낮은 외야수(30–70)는 LF/RF 위치(홈 80m)에서 직접 던지지 못하고 중계가 발동된다
- Throw 90 외야수는 LF/RF→홈(80m) 직접 송구 가능, Throw 110 이상은 CF→홈(88m)도 직접 가능
- 중계 발동 시 t_total이 직선 송구보다 짧아져 주자의 safe 확률이 낮아진다
- Throw 80 중계수 > Throw 50 중계수 — 더 많은 베이스 아웃을 유발한다
- 기존 경기 루프(`runGame`) 정상 동작 유지

---

## Requirements

### Must-have

**R1. `maxDirectDist(throw_stat)` 함수**
- `33.2 * Math.log(throw_stat) - 78` [m]
- `defence/throw-judge.ts`에 추가

**R2. `shouldUseRelay()` 판단 함수**
- `(fielder, fielder_pos, target_base_key, t_fielding, relay_man, relay_pos)` → `boolean`
- 내부: `can_reach`, `direct_faster` 두 조건 모두 체크
- throw_speed = `(80 + throw * 0.7) / 3.6` (기존 `resolveThrow`와 동일 공식 재사용)

**R3. `calcRelayPos()` 함수**
- `(fielder_pos, target_base_pos)` → `{ x, y }`
- `lerp(a, b, 0.45)` 단순 계산

**R4. `selectRelayMan()` 함수**
- `(fielder_pos, defenceLineup)` → `Player`
- `fielder_pos.x > 0` → SS, `<= 0` → 2B
- 없으면 dummy Player (Throw 70)

**R5. `resolveRelayThrow()` 함수**
- `(fielder, fielder_pos, relayMan, targetBase, t_fielding, runner, runner_dist)` → `'safe' | 'out'`
- `t_total` 계산 후 기존 sigmoid 판정

**R6. `resolveLeadingRunner` — 중계 분기 통합**
- 기존 `resolveThrow()` 직접 호출 전 `shouldUseRelay()` 체크
- true면 `resolveRelayThrow()`, false면 기존 `resolveThrow()`

**R7. `advanceRunners` — 후속 주자 공짜 진루 처리**
- `resolveLeadingRunner`는 leading runner만 담당 (기존 역할 유지)
- `advanceRunners` 레벨에서 `leadResult.nextRunners`를 받은 뒤, 비타깃 후속 주자를 +1베이스 전진 처리
- 단타 1·2루: 2루 주자가 leading → `leadResult` 처리 후 1루 주자를 2루로 이동
- 호출 순서: `selectRelayMan → calcRelayPos → shouldUseRelay → resolveRelayThrow or resolveThrow`
- 베이스 충돌 처리: `resolveBatterAdvance` 결과가 이미 점유된 베이스이면 타자는 한 칸 뒤 베이스로 (선행 주자 우선)

**R8. `AdvanceResult` 호환**
- `outs_added` 및 `moves` 기존 구조 유지
- 중계 플레이 경로에서도 동일 반환 타입

---

### Nice-to-have

**N1. `relay_used` 플래그 GameEvent에 추가**
- pitch 이후 `runner_advance` 이벤트에 `relay_used: boolean` 포함
- UI에서 중계 플레이 표시 가능

**N2. 중계수 포지션 실제 이동 모델링**
- 현재는 lerp로만 계산 → 추후 중계수의 실제 기본 포지션에서의 이동 거리를 반영
- 성능·복잡도 이슈로 우선순위 낮음

---

## 의존성

- `defence/throw-judge.ts` — `BASE_POS`, `resolveThrow`, `sigmoid` (기존)
- `defence/fielder-positions.ts` — `FIELDER_DEFAULT_POS` (기존)
- `game/runner-advance.ts` — `resolveLeadingRunner`, `advanceRunners` (수정 대상)
- `game/types.ts` — `Runners`, `GameEvent` (수정 없음)
