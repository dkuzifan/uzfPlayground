---
title: 야구 시뮬레이터 — 게임 루프 Tech Spec
date: 2026-03-31
prd: docs/baseball/prd/260331-game-loop.md
status: draft
---

## 의존성 분석 및 기술 설계

- **API**: 없음 — 순수 TypeScript 시뮬레이션 엔진, Next.js 무의존
- **DB**: 없음 — 모든 상태는 함수 인자/반환값으로만 전달
- **Domain**: `src/lib/baseball/game/` 신규 디렉토리 생성
  - 기존 엔진 (`throw-pitch.ts`, `hit-ball.ts`) 호출만 하며 수정 없음
- **UI**: 없음 — `simulate-game.mjs` 스크립트로 박스 스코어 콘솔 출력
- **Release Strategy**: 순수 로직 레이어, 기존 기능에 영향 없음. 직접 main push.

---

## 파일 구조

```
src/lib/baseball/game/
  types.ts          ← GameEvent, GameResult, Runners, AtBatContext 등 타입 정의
  config.ts         ← GAME_CONFIG (extra_innings_rule 기본값, 하드캡 등)
  runner-advance.ts ← MVP 주자 이동 룰 테이블 (advanceRunners)
  at-bat.ts         ← runAtBat() — throwPitch + hitBall 체인
  half-inning.ts    ← runHalfInning()
  game-loop.ts      ← runGame()

scripts/
  simulate-game.mjs ← 박스 스코어 출력 검증 스크립트
```

---

## 타입 설계 (`types.ts`)

```typescript
// 주자 상태 — null이면 해당 루 비어있음
export interface Runners {
  first:  Player | null
  second: Player | null
  third:  Player | null
}

// runAtBat()에 넘기는 컨텍스트
export interface AtBatContext {
  outs:            number
  runners:         Runners
  inning:          number
  isTop:           boolean
  familiarity:     FamiliarityMap
  stamina:         number          // 투수 남은 스태미나
  recent_pitches:  Array<{ type: PitchType; zone: ZoneId }>
}

// runAtBat() 반환값
export interface AtBatOutcome {
  result:               AtBatResult   // 'strikeout' | 'walk' | 'single' | ...
  outs_added:           number        // 이번 타석에서 발생한 아웃 수 (보통 0 or 1)
  runs_scored:          number        // 이번 타석에서 홈인한 주자 수
  next_runners:         Runners       // 타석 후 주자 상태
  next_stamina:         number
  next_familiarity:     FamiliarityMap
  next_recent_pitches:  Array<{ type: PitchType; zone: ZoneId }>
  events:               GameEvent[]
}

// 게임 이벤트 — UI 연결 대비
export type GameEventType =
  | 'pitch'           // 투구 1회
  | 'at_bat_result'   // 타석 종료
  | 'runner_advance'  // 주자 이동
  | 'score'           // 득점
  | 'inning_start'    // 반이닝 시작
  | 'inning_end'      // 반이닝 종료
  | 'game_end'        // 경기 종료
  // 향후 추가: 'error'|'double_play'|'tag_up'|'pickoff'|'pitching_change'|'stolen_base'

export interface GameEvent {
  type:    GameEventType
  inning:  number
  isTop:   boolean
  payload: Record<string, unknown>
  // payload 형태 (타입별):
  //   pitch          → { pitch: PitchResult; swing: boolean; contact: boolean|null; is_foul: boolean|null; next_count: {balls,strikes} }
  //   at_bat_result  → { batter: Player; result: AtBatResult; count: {...} }
  //   runner_advance → { from: 1|2|3|'home'; to: 1|2|3|'home'; runner: Player }[]
  //   score          → { scorer: Player; runs_total_home: number; runs_total_away: number }
  //   inning_start   → { inning: number; isTop: boolean }
  //   inning_end     → { outs: 3; runs_this_half: number }
  //   game_end       → { winner: 'home'|'away'|'draw'; reason: 'normal'|'walk_off'|'draw' }
}

// runGame() 반환값
export interface GameResult {
  winner:    'home' | 'away' | 'draw'
  score:     { home: number; away: number }
  linescore: { away: number[]; home: number[] }  // [1회, 2회, ..., N회]
  reason:    'normal' | 'walk_off' | 'draw'
  events:    GameEvent[]
}

// 연장 룰 (별도 기획 전 기본값: 무제한)
export type ExtraInningsRule = 'unlimited' | 'max12' | 'tiebreaker10'
```

---

## 함수 시그니처

### `runAtBat(pitcher, batter, ctx)`
```typescript
export function runAtBat(
  pitcher: Player,
  batter:  Player,
  ctx:     AtBatContext,
): AtBatOutcome
```
- `throwPitch` → `hitBall` 반복, `at_bat_over=true`까지
- `runners`는 `boolean` 기반 `GamePitchState` 포맷으로 변환 후 엔진에 전달
- `is_scoring_position`: 2루 또는 3루 주자 있으면 true
- familiarity 흐름: `runAtBat` → `next_familiarity` 반환 → 같은 반이닝 내 다음 `runAtBat`에 전달 → 반이닝 종료 시 `decayFamiliarity` 적용 후 다음 반이닝으로 인계

### `runHalfInning(lineup, pitcher, batterIndex, initState)`
```typescript
export function runHalfInning(
  lineup:       Player[],
  pitcher:      Player,
  batterIndex:  number,   // 이 반이닝 시작 타자 인덱스
  initState: {
    outs:      number     // 보통 0, 끝내기 연장 케이스 대비
    runners:   Runners
    stamina:   number
    familiarity: FamiliarityMap
  },
): {
  runs:          number
  finalRunners:  Runners
  nextBatterIdx: number   // 다음 반이닝 해당 팀의 시작 타자 인덱스
  nextStamina:   number
  nextFamiliarity: FamiliarityMap
  events:        GameEvent[]
}
```
- 아웃 3개 되면 종료
- 타순 순환: `(batterIndex + 1) % 9`

### `runGame(homeTeam, awayTeam, options?)`
```typescript
export function runGame(
  homeTeam: { lineup: Player[]; pitcher: Player },
  awayTeam: { lineup: Player[]; pitcher: Player },
  options?: { extra_innings_rule?: ExtraInningsRule },
): GameResult
```
- `awayBatterIdx`, `homeBatterIdx` 독립 관리
- 각 이닝: 초(원정 공격) → 말(홈 공격)
- **말 이닝 생략**: 이닝 초 종료 시점에 홈팀이 앞서면 말 공격 없이 종료
- **끝내기**: 말 이닝 도중 홈팀 앞서는 득점 → 즉시 종료
- **9이닝 후 동점**: `extra_innings_rule` 따름 (기본: `'unlimited'`)
- **무한루프 방지**: 하드캡 30이닝 (`GAME_CONFIG.max_innings_hard_cap`)

---

## 주자 이동 룰 (`runner-advance.ts`)

```typescript
// advanceRunners(result, runners, batter) → { nextRunners, runsScored }
// 볼넷/사구: forceAdvance(runners, batter) → 강제 진루 처리
```

| 결과 | 3루 주자 | 2루 주자 | 1루 주자 | 타자 |
|------|---------|---------|---------|------|
| single | 홈 | 3루 | 2루 | 1루 |
| double | 홈 | 홈 | 3루 | 2루 |
| triple | 홈 | 홈 | 홈 | 3루 |
| home_run | 홈 | 홈 | 홈 | 홈 |
| walk/hbp | — 강제 진루 — | | | 1루 |

볼넷/사구 강제 진루: 1루→2루→3루→홈 순으로 연쇄 (만루 시 3루 주자 득점)

---

## `runners` 포맷 변환 주의

기존 엔진 (`GamePitchState`)은 `runners: { first: boolean; second: boolean; third: boolean }` 사용.
게임 루프는 `Runners: { first: Player | null; ... }` 사용.
`runAtBat` 내부에서 `Player | null → boolean` 변환 후 엔진에 전달.

---

## Plan (Implementation Checklist)

**Phase 1: 타입 + 주자 이동**
- [ ] `src/lib/baseball/game/types.ts` — Runners, AtBatContext, AtBatOutcome, GameEvent, GameResult, ExtraInningsRule
- [ ] `src/lib/baseball/game/config.ts` — GAME_CONFIG (max_innings_hard_cap=30, default extra_innings_rule='unlimited')
- [ ] `src/lib/baseball/game/runner-advance.ts` — advanceRunners(), forceAdvance()

**Phase 2: 타석 루프**
- [ ] `src/lib/baseball/game/at-bat.ts` — runAtBat()
  - Runners → boolean 변환 헬퍼
  - throwPitch → hitBall 체인
  - `pitch` 이벤트 생성 (PitchResult + BattingResult 합성)
  - `at_bat_result` 이벤트 생성 (at_bat_over 시)

**Phase 3: 반이닝 루프**
- [ ] `src/lib/baseball/game/half-inning.ts` — runHalfInning()
  - 타순 순환 (`% 9`)
  - familiarity 타석 간 인계, 반이닝 종료 시 decayFamiliarity 적용
  - `inning_start` / `inning_end` 이벤트 생성
  - `runner_advance` / `score` 이벤트 생성

**Phase 4: 경기 루프**
- [ ] `src/lib/baseball/game/game-loop.ts` — runGame()
  - awayBatterIdx / homeBatterIdx 독립 관리
  - 말 이닝 생략 (이닝 초 종료 시 홈팀 리드 확인)
  - 끝내기 감지 (말 이닝 도중 홈팀 앞서는 득점)
  - 9이닝 후 동점 → extra_innings_rule 분기
  - 하드캡 30이닝 초과 시 'draw' 강제 종료
  - `game_end` 이벤트 생성

**Phase 5: 검증**
- [ ] `scripts/simulate-game.mjs` — 박스 스코어 출력 (라인스코어 + 최종 스코어 + 이닝별 득점)
- [ ] `npx tsc --noEmit` 통과

---

## 테스트 계획

**핵심 기본 플로우 검증 (Regression)**
- [ ] `npx tsc --noEmit` — 기존 엔진 타입 깨짐 없음
- [ ] `simulate-batting.mjs` 정상 실행 — 타격 엔진 영향 없음

**신규 피처 플로우 검증 (`simulate-game.mjs`)**
- [ ] 9이닝 정상 완주 — linescore 배열 길이 9, 합계 = 최종 스코어
- [ ] 끝내기 정상 처리 — reason='walk_off', 해당 이닝 말 중간 종료
- [ ] 말 이닝 생략 — 9회 초 후 원정 팀이 지고 있으면 말 공격 없이 종료
- [ ] 타순 인계 — away/home 타순 인덱스 독립 관리
- [ ] 볼넷 만루 득점 — 강제 진루로 3루 주자 홈인
- [ ] 런타임 에러 없이 완주 (10경기 연속)
- [ ] Sanity check: 10경기 평균 득점 양팀 합산 3~20점 범위 (루프 버그 감지용)

---

## 데이터 흐름

DB 없음. 모든 상태는 함수 반환값으로만 전달 (순수 함수).

```
runGame(homeTeam, awayTeam)
│
│  [이닝 루프 — 1회~최대 30회]
│
├─ runHalfInning(lineup, pitcher, batterIdx, { runners, stamina, familiarity })
│  │
│  ├─ emit: inning_start
│  │
│  ├─ [타석 루프 — 아웃 3개까지]
│  │
│  │  runAtBat(pitcher, batter, ctx)
│  │    ├─ throwPitch(GamePitchState)    → PitchResult
│  │    ├─ hitBall(BattingState, pitch)  → BattingResult
│  │    ├─ emit: pitch  (PitchResult + BattingResult 합성)
│  │    ├─ emit: at_bat_result  (at_bat_over=true 시)
│  │    └─ return: AtBatOutcome { result, next_runners, runs_scored, ... }
│  │
│  ├─ [runHalfInning: before vs after 비교]
│  │    ├─ emit: runner_advance  (주자 이동 내역)
│  │    └─ emit: score           (득점 발생 시)
│  │
│  ├─ decayFamiliarity() — 반이닝 종료 시
│  ├─ emit: inning_end
│  └─ return: { runs, nextBatterIdx, nextStamina, nextFamiliarity, events }
│
├─ [이닝 초 종료 후] 홈팀 리드 → 말 공격 생략, 경기 종료
├─ [말 이닝 중] 홈팀 앞서는 득점 → 끝내기, 즉시 종료
├─ [9이닝 후 동점] extra_innings_rule 따라 연장 or draw
│
├─ emit: game_end { winner, reason }
└─ return: GameResult
```

---

## Risk & Rollback

| 리스크 | 발생 조건 | 대응 |
|--------|---------|------|
| 무한 루프 | extra_innings_rule='unlimited' + 영원히 동점 | 하드캡 30이닝 초과 시 강제 'draw' 종료 |
| 타순 버그 | awayBatterIdx / homeBatterIdx 혼용 | 두 변수 완전 분리, runHalfInning 반환값으로만 업데이트 |
| runners 타입 불일치 | Player\|null ↔ boolean 변환 누락 | at-bat.ts 내 변환 헬퍼 단일 위치 관리 |
| 끝내기 미감지 | 말 이닝 득점 후 루프 계속 진행 | runHalfInning에 isBottom 플래그 전달, homeAhead 확인 후 즉시 종료 |

**롤백**: `src/lib/baseball/game/` 디렉토리 삭제만으로 기존 엔진 완전 독립 유지. 기존 파일 수정 없음.
