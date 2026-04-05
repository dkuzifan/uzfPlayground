---
title: 야구 시뮬레이터 — 게임 스탯 누적
date: 2026-03-31
owner: @dkuzifan
status: draft
---

## Context

현재 `runGame()`은 `GameEvent[]`와 최종 스코어만 반환한다.
100경기를 시뮬해도 "누가 이겼는가"만 알 수 있고, 선수별/팀별 기록은 전혀 남지 않는다.

시즌 시뮬레이션 및 감독 모드로 나아가려면 **한 경기 단위의 스탯 박스**가 필수다.
`GameEvent[]`는 이미 모든 정보를 담고 있으므로, 이를 소비(consume)하는
순수 함수 `calcGameStats(events, homeLineup, awayLineup)` 하나로 구현 가능하다.

### 관련 문서
- `docs/baseball/check/Simulator_20240507.md` — 스탯 집계 규칙 원본 (Line 580~600)
- `src/lib/baseball/game/types.ts` — `GameEvent`, `GameResult` 타입
- `src/lib/baseball/game/game-loop.ts` — `runGame()` 반환값

### 현재 `GameEvent` payload 구조
| 이벤트 | payload 주요 필드 |
|--------|-----------------|
| `at_bat_result` | `batter: Player`, `result: AtBatResult` |
| `score` | `runs_scored`, `runs_total_home`, `runs_total_away` |
| `runner_advance` | `moves: RunnerMove[]` |
| `steal_result` | `runner: Player`, `success: boolean` |
| `pickoff_result` | `runner: Player`, `out: boolean` |
| `pitching_change` | `outgoing: Player`, `incoming: Player`, `outs` |
| `pitch` | `pitch: PitchResult`, `swing`, `contact` |
| `game_end` | `winner`, `reason`, `score` |

---

## MVP 범위 결정

**한 경기(GameResult) → 스탯 박스(GameStats)** 변환에 집중한다.
시즌 누적은 별도 피처에서 처리한다.

---

## Goals / Non-Goals

**Goals (MVP):**
- **G1** `GameEvent[]`를 소비하여 선수별 타격 스탯 계산 (AB/H/2B/3B/HR/BB/SO/RBI/SB/CS)
- **G2** 선수별 투구 스탯 계산 (IP/H/ER/BB/SO/W/L/SV)
- **G3** 승리 투수 / 패전 투수 / 세이브 판정 (Simulator 규칙 기반)
- **G4** `GameResult`에 `stats: GameStats` 필드 추가 — 기존 인터페이스 하위 호환
- **G5** `simulate-game.mjs`에 박스스코어(타자/투수 라인) 출력 추가

**Non-Goals:**
- 시즌 누적 스탯 DB 저장 — 별도 피처 (스탯 DB 피처)
- 수비 스탯 (E/PO/A) — 수비 엔진 미구현 상태
- 세부 투구 스탯 (BB/9, K/9, WHIP 등) — 시즌 스탯 피처에서 처리
- 희생번트/희생플라이 판정 — 번트 stub 상태, 별도 구현 후 추가
- SHO (완봉) — 시즌 스탯 피처에서 처리

---

## 스탯 집계 규칙 (Simulator_20240507.md 기반)

### 타자 스탯 증감 규칙
| 결과 | AB | H | 2B | 3B | HR | BB | SO | RBI | SB | CS |
|------|----|----|----|----|----|----|-----|-----|----|-----|
| single | +1 | +1 | | | | | | +홈인 수 | | |
| double | +1 | +1 | +1 | | | | | +홈인 수 | | |
| triple | +1 | +1 | | +1 | | | | +홈인 수 | | |
| home_run | +1 | +1 | | | +1 | | | +홈인 수+1 | | |
| out | +1 | | | | | | | | | |
| strikeout | +1 | | | | | | +1 | | | |
| walk | | | | | | +1 | | | | |
| hit_by_pitch | | | | | | +1 | | | | |
| steal(success) | | | | | | | | | +1 | |
| steal(caught) | | | | | | | | | | +1 |

### 투수 스탯 증감 규칙
| 결과 | IP | H | ER | BB | SO |
|------|----|----|----|----|-----|
| out(비삼진) | +0.1 | | | | |
| strikeout | +0.1 | | | | +1 |
| single/2B/3B/HR | | +1 | | | |
| walk/HBP | | | | +1 | |
| 득점 발생(ER) | | | +1 | | |
※ IP는 0.3 누적 시 1.0으로 올림 처리 (1이닝 = 3아웃)

### 승리/패전/세이브 판정
- **승리 투수**: 팀 승리 시, 팀이 리드를 취한 시점에 마운드에 있던 투수
- **패전 투수**: 팀 패배 시, 상대팀 결승점(winning run)을 허용한 투수
- **세이브**: 승리팀 마지막 투수 중 `점수차 - (등판 시 주자수 + 1) < (2 + 남은이닝수)` 조건 충족 시

---

## Requirements

### Must-have

**R1. 스탯 타입 정의 (`game/stats-types.ts` 신규)**
- `BatterGameStats`: AB/H/1B/2B/3B/HR/BB/SO/RBI/SB/CS + 파생값 AVG/OBP/SLG/OPS
- `PitcherGameStats`: IP(소수 표현)/H/ER/BB/SO/W/L/SV + 파생값 ERA
- `TeamGameStats`: `{ batters: Map<playerId, BatterGameStats>; pitchers: Map<playerId, PitcherGameStats> }`
- `GameStats`: `{ home: TeamGameStats; away: TeamGameStats }`

**R2. 스탯 계산기 (`game/calc-game-stats.ts` 신규)**
- `calcGameStats(events: GameEvent[], home: TeamInfo, away: TeamInfo): GameStats`
  - `TeamInfo`: `{ lineup: Player[]; pitcher: Player; bullpen?: Player[] }`
- 리듀서 패턴: 이벤트를 순서대로 한 번만 순회하여 모든 스탯 동시 업데이트
- RBI 집계: `runner_advance` 이벤트의 `moves`에서 `to === 'home'`인 항목 카운트
- IP 표현: 내부는 아웃 수(정수)로 관리, 출력 시 `Math.floor(outs/3) + (outs%3)/10` 변환

**R3. 승리/패전/세이브 판정**
- 승리 투수: 경기 이벤트에서 팀이 처음으로 리드를 취한 `score` 이벤트 시점의 현재 투수
  - 동점으로 다시 내줬다가 재역전해도 "처음 리드 취득 시점"의 투수로 고정
- 패전 투수: 패배팀의 결승점(`score` 이벤트 중 패배팀 기준 역전/결승점)을 허용한 투수
- 세이브: 승리팀 마지막 투수가 승리 투수가 아닌 경우, 세이브 조건 체크
  - 조건: `점수차 - (등판 시점 주자수 + 1) < (2 + 남은이닝수)`
  - 단순화: MVP에서는 `점수차 ≤ 3`이고 마지막 투수가 승리 투수가 아닌 경우 세이브로 처리

**R4. `GameResult` 확장 (`game/types.ts` 수정)**
- `GameResult`에 `stats: GameStats` 필드 추가
- `runGame()` 반환 시 `calcGameStats(allEvents, homeTeam, awayTeam)` 호출하여 포함

**R5. `simulate-game.mjs` 박스스코어 출력**
- 타자 라인: 이름/AB/H/HR/RBI/AVG
- 투수 라인: 이름/IP/H/ER/BB/SO/ERA + W/L/SV 표시

### Nice-to-have

**N1. 파생 스탯 실시간 계산**
- `calcDerived(stats: BatterGameStats): { AVG, OBP, SLG, OPS }` 별도 함수로 분리
  - 경기 중간에 호출해도 나누기 0 안전 처리 (AB=0이면 0 반환)

**N2. 경기 중 부분 집계**
- `calcGameStats(events.slice(0, n), ...)` 패턴으로 중간 스냅샷 가능 — 설계 변경 불필요, 사용 측에서 슬라이스만 하면 됨

---

## Success Definition

- `npx tsc --noEmit` 통과
- 100경기 시뮬 후 `gameStats.away.batters` / `gameStats.home.batters` 집계 정상 출력
- 타자 타율 (H/AB) ≈ 0.25~0.30 범위 (현재 시뮬 결과와 일치)
- 승리 투수 / 패전 투수 각 1명씩 정상 판정
