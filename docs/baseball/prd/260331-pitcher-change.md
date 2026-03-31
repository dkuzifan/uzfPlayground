---
title: 야구 시뮬레이터 — 투수 교체
date: 2026-03-31
owner: @dkuzifan
status: draft
---

## Context

현재 `runGame`은 팀당 투수 1명만 받는다 (`homeTeam: { lineup, pitcher }`).
`checkRelief(stamina)` 함수는 이미 구현되어 있지만 game-loop에서 전혀 호출되지 않아,
스태미나가 0이 돼도 같은 투수가 경기 끝까지 던지는 상태다.

실제 야구에서 선발 투수는 스태미나 한계에 도달하면 불펜 투수로 교체된다.
투수 교체 없이는 시즌 시뮬레이션이나 감독 모드로 확장할 수 없다.

### 설계 원칙
- `pitcher`는 "이 경기에 첫 번째로 던지는 투수" — 에이스 선발, 오프너, 불펜 투수 선발 기용 모두 동일 슬롯
- 시즌 모드에서는 로테이션 로직이 5~6명 중 누구를 `pitcher`에 세팅할지 결정함 (runGame은 무관)
- 선발/불펜 경계가 없는 오픈 구조 유지

### 관련 문서
- `docs/baseball/check/Simulator_20240507.md` — 투수 교체 조건 (투구 수 ≤0 + 볼카운트 0-0)
- `src/lib/baseball/engine/stamina.ts` — `checkRelief(stamina)` 구현됨
- `src/lib/baseball/game/game-loop.ts` — 수정 대상

---

## Goals / Non-Goals

**Goals (MVP):**
- **G1** 팀 구조에 불펜(`bullpen: Player[]`) 추가 — `pitcher`는 "이 경기의 첫 번째 투수"로 유지 (에이스/오프너 모두 동일 슬롯)
- **G2** 타석 시작 전(볼카운트 0-0) 스태미나 체크 → `checkRelief` true 시 불펜 선두 투수 자동 투입
- **G3** 교체 시 familiarity 리셋 (새 투수는 타선에 생소함), stamina는 해당 투수의 `stats.stamina`로 초기화
- **G4** `pitching_change` GameEvent 추가 — 누가 교체됐는지 기록
- **G5** 불펜 소진 시 마지막 투수가 스태미나 0 상태로 계속 던짐 (현실적 처리)

**Non-Goals:**
- 감독의 수동 교체 판단 (UI/입력 없음 — 감독 모드는 별도 기획)
- 타자 교체
- 투구 수(pitch count) 별도 추적 — 스태미나로 대체
- 재등판 금지 규칙
- 투수 워밍업 시간

---

## Success Definition

- 100경기 시뮬레이션에서 불펜이 있는 팀이 적절히 투수 교체를 사용하는 것을 `pitching_change` 이벤트로 확인
- 기존 `simulate-game.mjs` 결과와 비교해 평균 득점이 교체 시 변화 (교체 투수 능력치 반영)
- `npx tsc --noEmit` 통과

---

## Requirements

### Must-have

**R1. 팀 구조 확장**
- `runGame` 파라미터: `{ lineup: Player[]; pitcher: Player; bullpen?: Player[] }`
- `bullpen` optional (기본값 `[]`) → 기존 호출 코드 무수정 호환
- `runHalfInning`에 `bullpen: Player[]` 전달 → 반이닝 내 타석 중간에도 교체 가능하도록
- `HalfInningResult`에 `currentPitcher: Player` 추가 → 교체 후 투수를 game-loop에 반환
- game-loop에서 `homePitcher`, `awayPitcher` 변수로 추적 → 다음 반이닝 호출 시 갱신된 투수 전달

**R2. 교체 타이밍 및 조건**

*타이밍*
- 시뮬 엔진: 볼카운트 0-0(타석 시작) 시점에서만 교체 — 타석 진행 중 교체 없음
- 감독 모드(별도 기획): 볼카운트 무관하게 언제든 교체 가능 → 이 피처는 감독 모드를 위해 교체 판단을 함수로 분리

*자동 교체 판단 함수*
- `shouldAutoRelieve(stamina, bullpen): boolean`을 별도 함수로 분리
- 시뮬 엔진은 이 함수를 0-0 시점에 호출
- 감독 모드는 이 함수 대신 유저 입력을 사용 (runGame 레벨에서 교체)
- MVP 판단 기준: `checkRelief(stamina) === true` AND `bullpen.length > 0`

*교체 실행*
- `bullpen.shift()` (불펜 선두 투수 투입)
- 상태 초기화: `stamina = incoming.stats.stamina`, `familiarity = {}`, `recent_pitches = []`

**R3. `pitching_change` GameEvent**
- `GameEventType`에 `'pitching_change'` 추가
- payload: `{ outgoing: Player; incoming: Player; outs: number }`

**R4. 불펜 소진 처리**
- `checkRelief` true이지만 `bullpen.length === 0` → 현재 투수 유지 (소진 상태로 계속)
- 별도 이벤트 없음 (정상 흐름)

**R5. `relief_threshold` 조정**
- `STAMINA_CONFIG.relief_threshold: 0 → 20`
- 근거: 선발 stamina=100, fatigue=0.7/구 기준 → (100-20)/0.7 ≈ 114구에서 교체
  → 9이닝 ~116구이므로 선발이 거의 완투 직전에 교체선 도달, 불펜 있으면 교체 발생
- 투수별 `stats.stamina` 값으로 선발/불펜 지속력 차별화 가능 (선발 100, 불펜 50~70)

### Nice-to-have
- N1. `pitching_change` payload에 `scoreHome`, `scoreAway` 포함

---

## User Flows

### 자동 투수 교체 흐름
```
반이닝 시작
  └─ [타석 시작 전]
       checkRelief(currentStamina)?
         YES → bullpen.length > 0?
                 YES → 불펜 shift → pitching_change 이벤트 → stamina/familiarity 리셋
                 NO  → 현재 투수 유지 (소진 상태로 계속)
         NO  → 현재 투수 유지
  └─ runAtBat 실행
```
