---
title: 야구 시뮬레이터 — 투수 교체 Tech Spec
date: 2026-03-31
prd: docs/baseball/prd/260331-pitcher-change.md
status: draft
---

## 의존성 분석 및 기술 설계

- **API**: 없음 — 순수 TypeScript 엔진
- **DB**: 없음
- **Release Strategy**: 기존 `runGame` 호환 유지 (`bullpen` optional), 직접 main push

---

## 수정 대상 파일

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `engine/config.ts` | 수정 | `relief_threshold: 0 → 20` |
| `engine/stamina.ts` | 수정 | `shouldAutoRelieve()` 추가 |
| `game/types.ts` | 수정 | `pitching_change` 이벤트 타입, `HalfInningInit.bullpen`, `HalfInningResult.currentPitcher` |
| `game/half-inning.ts` | 수정 | 타석 시작 전 교체 체크 로직 |
| `game/game-loop.ts` | 수정 | 팀 타입 확장, pitcher/bullpen 추적 |
| `scripts/simulate-game.mjs` | 수정 | 불펜 포함 팀 구성으로 업데이트 |

---

## 타입 변경 (`game/types.ts`)

```typescript
// GameEventType — 'pitching_change' 추가
export type GameEventType =
  | 'pitch'
  | 'at_bat_result'
  | 'runner_advance'
  | 'score'
  | 'inning_start'
  | 'inning_end'
  | 'pitching_change'   // ← 신규
  | 'game_end'
  // payload: { outgoing: Player; incoming: Player; outs: number }

// HalfInningInit — bullpen 추가
export interface HalfInningInit {
  outs:          number
  runners:       Runners
  stamina:       number
  familiarity:   FamiliarityMap
  scoreHome:     number
  scoreAway:     number
  allowWalkOff?: boolean
  bullpen?:      Player[]   // ← 신규 (optional, 기본 [])
}

// HalfInningResult — currentPitcher 추가
export interface HalfInningResult {
  runs:             number
  finalRunners:     Runners
  nextBatterIdx:    number
  nextStamina:      number
  nextFamiliarity:  FamiliarityMap
  walkOff:          boolean
  currentPitcher:   Player   // ← 신규 (교체 발생 시 새 투수, 아니면 원래 투수)
  events:           GameEvent[]
}
```

---

## `shouldAutoRelieve` (`engine/stamina.ts`)

```typescript
import type { Player } from '../types/player'

export function shouldAutoRelieve(stamina: number, bullpen: Player[]): boolean {
  return checkRelief(stamina) && bullpen.length > 0
}
```

- 판단 기준만 캡슐화 — 나중에 감독 모드에서 이 함수 대신 유저 입력 사용
- `checkRelief(stamina)`: `stamina <= relief_threshold (20)`

---

## `runHalfInning` 변경 (`game/half-inning.ts`)

```typescript
export function runHalfInning(
  lineup:    Player[],
  pitcher:   Player,      // 이 반이닝 시작 투수 (mutable local로 복사)
  batterIdx: number,
  inning:    number,
  isTop:     boolean,
  init:      HalfInningInit,
): HalfInningResult {
  let currentPitcher = pitcher             // ← mutable 복사
  let bullpen        = [...(init.bullpen ?? [])]  // ← 불펜 복사 (shift 해도 원본 안전)

  // ... 기존 초기화 ...

  while (outs < 3) {
    // ── 타석 시작 전 교체 체크 (0-0 타이밍) ──────────────
    if (shouldAutoRelieve(stamina, bullpen)) {
      const outgoing = currentPitcher
      const incoming = bullpen.shift()!
      currentPitcher  = incoming
      stamina         = incoming.stats.stamina
      familiarity     = {}
      recent_pitches  = []

      events.push({
        type:    'pitching_change',
        inning,
        isTop,
        payload: { outgoing, incoming, outs },
      })
    }

    const outcome = runAtBat(currentPitcher, batter, { ... })
    // ... 기존 로직 ...
  }

  return {
    // ... 기존 필드 ...
    currentPitcher,   // ← 교체 발생 시 새 투수, 아니면 원래 투수
  }
}
```

---

## `runGame` 변경 (`game/game-loop.ts`)

```typescript
// 팀 타입 확장
export function runGame(
  homeTeam: { lineup: Player[]; pitcher: Player; bullpen?: Player[] },
  awayTeam: { lineup: Player[]; pitcher: Player; bullpen?: Player[] },
  options?: { extra_innings_rule?: ExtraInningsRule },
): GameResult

// 추가 추적 변수
let homePitcher  = homeTeam.pitcher
let awayPitcher  = awayTeam.pitcher
let homeBullpen  = [...(homeTeam.bullpen ?? [])]
let awayBullpen  = [...(awayTeam.bullpen ?? [])]

// runHalfInning 호출 시 bullpen 전달
const topResult = runHalfInning(awayTeam.lineup, homePitcher, ..., {
  ...,
  bullpen: homeBullpen,
})
// 반이닝 종료 후 투수/불펜 갱신
homePitcher = topResult.currentPitcher
// (불펜 shift는 runHalfInning 내부에서 이미 처리됨 — 외부 bullpen 배열도 동기화 필요)

// ※ 불펜 동기화: runHalfInning이 bullpen 복사본을 shift하므로
//   game-loop의 homeBullpen도 교체 횟수만큼 shift 해야 함.
//   → 교체 횟수는 pitching_change 이벤트 수로 카운트하거나,
//     HalfInningResult에 remainingBullpen 반환하는 방식 중 선택.
//   → MVP: HalfInningResult에 remainingBullpen: Player[] 추가
```

---

## 불펜 동기화 문제 및 해결

`runHalfInning`은 `bullpen` 복사본을 받아서 내부에서 `shift()`한다.
하지만 game-loop의 `homeBullpen`은 이 변경을 모른다.

**해결**: `HalfInningResult`에 `remainingBullpen: Player[]` 추가 → game-loop에서 갱신

```typescript
// HalfInningResult 추가 필드
remainingBullpen: Player[]

// game-loop
homeBullpen = topResult.remainingBullpen
```

이렇게 하면 순수 함수 원칙 유지 + 불펜 상태 정확히 전파.

---

## 데이터 흐름

```
runGame
  homeBullpen = [...homeTeam.bullpen]
  awayBullpen = [...awayTeam.bullpen]
  homePitcher = homeTeam.pitcher
  awayPitcher = awayTeam.pitcher

  loop:
    topResult = runHalfInning(lineup=away, pitcher=homePitcher, bullpen=homeBullpen)
      → 타석마다 shouldAutoRelieve 체크
      → 교체 발생: stamina/familiarity/recent_pitches 리셋, pitching_change 이벤트
      → 반환: currentPitcher, remainingBullpen
    homePitcher = topResult.currentPitcher
    homeBullpen = topResult.remainingBullpen
    homeStamina = topResult.nextStamina        // 새 투수 기준 스태미나

    botResult = runHalfInning(lineup=home, pitcher=awayPitcher, bullpen=awayBullpen)
    awayPitcher = botResult.currentPitcher
    awayBullpen = botResult.remainingBullpen
    awayStamina = botResult.nextStamina
```

---

## `relief_threshold` 조정

```typescript
// engine/config.ts
relief_threshold: 20   // 0 → 20
```

- 선발 stamina=100, fatigue=0.7/구: (100-20)/0.7 ≈ 114구에서 교체
- 9이닝 완투 ≈ 116구 → 선발이 9이닝 마지막에 교체선 도달
- 불펜 투수 stamina=60으로 설정하면: (60-20)/0.7 ≈ 57구 ≈ 2~3이닝

---

## 실행 계획 (Phase별 체크리스트)

**Phase 1 — 타입/설정 변경**
- [ ] `engine/config.ts`: `relief_threshold` 0 → 20
- [ ] `engine/stamina.ts`: `shouldAutoRelieve()` 추가
- [ ] `game/types.ts`: `pitching_change` 이벤트, `HalfInningInit.bullpen`, `HalfInningResult.currentPitcher + remainingBullpen`

**Phase 2 — half-inning 교체 로직**
- [ ] `game/half-inning.ts`: `currentPitcher` mutable, 타석 전 교체 체크, `pitching_change` 이벤트 emit

**Phase 3 — game-loop 확장**
- [ ] `game/game-loop.ts`: 팀 타입 `bullpen?`, `homePitcher`/`awayPitcher`/`homeBullpen`/`awayBullpen` 추적

**Phase 4 — 검증**
- [ ] `scripts/simulate-game.mjs`: 불펜 있는 팀 구성 추가, `pitching_change` 이벤트 카운트 출력
- [ ] `npx tsc --noEmit`

---

## Risk & Rollback

| 리스크 | 대응 |
|--------|------|
| `bullpen` optional이지만 기존 코드 깨짐 | `bullpen ?? []` 기본값으로 처리, tsc로 검증 |
| 불펜 소진 후 소진 상태 투수가 계속 던짐 | 의도된 동작 (R4), 이벤트 없이 조용히 처리 |
| 새 투수 familiarity 리셋으로 인한 타자 유리 | 설계 의도 — 새 투수는 타선에 생소 |
