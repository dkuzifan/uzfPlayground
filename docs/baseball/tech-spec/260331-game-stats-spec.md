---
title: 야구 시뮬레이터 — 게임 스탯 누적 Tech Spec
date: 2026-03-31
prd: docs/baseball/prd/260331-game-stats.md
status: draft
---

## 의존성 분석

- **API**: 없음 — 순수 TypeScript 엔진
- **DB**: 없음
- **Release Strategy**: 직접 main push

---

## 수정/신규 파일 목록

| 파일 | 유형 | 내용 |
|------|------|------|
| `game/stats-types.ts` | 신규 | `BatterGameStats`, `PitcherGameStats`, `GameStats` 타입 |
| `game/calc-game-stats.ts` | 신규 | 리듀서 기반 스탯 계산기 |
| `game/types.ts` | 수정 | `GameResult`에 `stats: GameStats` 추가 |
| `game/game-loop.ts` | 수정 | `calcGameStats` 호출 후 반환에 포함 |
| `scripts/simulate-game.mjs` | 수정 | 박스스코어 출력 추가 |

---

## 타입 설계

### `game/stats-types.ts`

```typescript
// 타자 1경기 성적
export interface BatterGameStats {
  player:  Player
  AB:  number   // 타수
  H:   number   // 안타
  '2B': number  // 2루타
  '3B': number  // 3루타
  HR:  number   // 홈런
  BB:  number   // 볼넷 (HBP 포함)
  SO:  number   // 삼진
  RBI: number   // 타점
  SB:  number   // 도루 성공
  CS:  number   // 도루 실패
}

// 투수 1경기 성적
export interface PitcherGameStats {
  player: Player
  outs:   number   // 내부 이닝 표현 (아웃 수 정수). 표시 시 formatIP() 사용
  H:      number   // 피안타
  ER:     number   // 자책점
  BB:     number   // 볼넷 허용 (HBP 포함)
  SO:     number   // 탈삼진
  W:      boolean  // 승
  L:      boolean  // 패
  SV:     boolean  // 세이브
}

// IP 표시용 변환: 7 outs → "2.1", 9 outs → "3.0"
export function formatIP(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`
}

// 파생 스탯 계산
export function calcBatterDerived(s: BatterGameStats) {
  const AVG = s.AB > 0 ? s.H / s.AB : 0
  const OBP = (s.AB + s.BB) > 0 ? (s.H + s.BB) / (s.AB + s.BB) : 0
  const singles = s.H - s['2B'] - s['3B'] - s.HR
  const SLG = s.AB > 0 ? (singles + 2*s['2B'] + 3*s['3B'] + 4*s.HR) / s.AB : 0
  return { AVG, OBP, SLG, OPS: OBP + SLG }
}

export function calcPitcherDerived(s: PitcherGameStats) {
  const ip = s.outs / 3
  const ERA  = ip > 0 ? (s.ER * 9) / ip : 0
  const WHIP = ip > 0 ? (s.BB + s.H) / ip : 0
  return { ERA, WHIP, IP: formatIP(s.outs) }
}

export interface TeamGameStats {
  batters:  BatterGameStats[]   // 타순 순서
  pitchers: PitcherGameStats[]  // 등판 순서
}

export interface GameStats {
  home: TeamGameStats
  away: TeamGameStats
}
```

---

## `game/calc-game-stats.ts` 설계

### 함수 시그니처

```typescript
export function calcGameStats(
  events:   GameEvent[],
  homeTeam: { lineup: Player[]; pitcher: Player; bullpen?: Player[] },
  awayTeam: { lineup: Player[]; pitcher: Player; bullpen?: Player[] },
): GameStats
```

### 리듀서 상태 구조

```typescript
// 계산기 내부 상태
type State = {
  home: {
    batters:        Map<string, BatterGameStats>   // playerId → stats
    pitchers:       Map<string, PitcherGameStats>  // playerId → stats
    pitcherOrder:   string[]                       // 등판 순서
    currentPitcher: string                         // 현재 마운드 투수 id
    score:          number
  }
  away: { /* 동일 */ }
  pendingBatter: { side: 'home'|'away'; id: string } | null
  // at_bat_result 직후 runner_advance까지 유지 (RBI 귀속용)
}
```

### 이벤트 처리 로직

```
for each event:

  'at_bat_result':
    side = event.isTop ? 'away' : 'home'   (공격 팀)
    batter = event.payload.batter
    result = event.payload.result
    pitcherSide = 반대팀
    pitcher = state[pitcherSide].currentPitcher

    switch result:
      single/double/triple/home_run:
        batter.AB++, batter.H++
        if double  → batter['2B']++
        if triple  → batter['3B']++
        if home_run → batter.HR++
        pitcher.H++
        pendingBatter = { side, id: batter.id }

      out:
        batter.AB++
        pitcher.outs++

      strikeout:
        batter.AB++, batter.SO++
        pitcher.outs++, pitcher.SO++

      walk / hit_by_pitch:
        batter.BB++
        pitcher.BB++
        pendingBatter = { side, id: batter.id }   // 볼넷도 RBI 가능 (만루 볼넷)

      pickoff_out / caught_stealing:
        pitcher.outs++
        (RBI 없음, pendingBatter 설정 안 함)

  'runner_advance':
    homeRuns = moves.filter(m => m.to === 'home' && !event.isTop).length
    awayRuns = moves.filter(m => m.to === 'home' && event.isTop).length
    if pendingBatter && (homeRuns > 0 || awayRuns > 0):
      runs = event.isTop ? awayRuns : homeRuns
      batters[pendingBatter.side][pendingBatter.id].RBI += runs
    if home_run result (처리 시점에 batter도 홈인):
      별도 처리 — home_run 시 batter 자신의 RBI도 +1 (위 at_bat_result에서 처리)
    pendingBatter = null

  'score':
    side = event.isTop ? 'away' : 'home'
    runs = event.payload.runs_scored
    state[pitcherSide].currentPitcher.ER += runs

  'steal_result':
    runner = event.payload.runner
    side = event.isTop ? 'away' : 'home'
    if success → batter[side][runner.id].SB++
    else       → batter[side][runner.id].CS++

  'pitching_change':
    side = event.isTop ? 'home' : 'away'   (수비팀 교체)
    state[side].currentPitcher = incoming.id
    state[side].pitcherOrder.push(incoming.id)

  'pickoff_result':
    out = event.payload.out
    if out → pitcherSide.currentPitcher.outs++
    (이미 at_bat_result 'pickoff_out'에서 처리 — 중복 방지 필요)
    → at_bat_result에서만 처리, pickoff_result에서는 처리 안 함
```

### home_run RBI 처리 특이사항

```
home_run 시:
  - 홈인 주자 수 RBI = runner_advance의 to==='home' moves 수
  - 타자 자신의 RBI +1 → at_bat_result 처리 시점에 직접 +1
  (runner_advance에서 batter.from==='batter', to==='home' move도 포함되므로
   runner_advance에서 전부 세면 자동 포함됨 — 별도 +1 불필요)
```

### W/L/SV 판정 (이벤트 후처리)

```typescript
function assignWLS(state: State, winner: 'home'|'away'|'draw'): void {
  if (winner === 'draw') return

  const winSide  = winner          // 'home' | 'away'
  const loseSide = winner === 'home' ? 'away' : 'home'

  // ── 결승점 이벤트 탐색 ──────────────────────────────────────
  // score 이벤트를 순서대로 보면서 최종 리드가 확정된 시점 추적
  // "결승점" = 승리팀이 마지막으로 역전/동점 타개한 시점의 득점

  // 구현: score 이벤트 배열 재탐색
  //   homeScore, awayScore를 누적하며
  //   winSide가 리드를 가져간 마지막 score 이벤트 → 그 시점의 pitchers 기록

  const winningPitcherId = state[winSide].winnerPitcherIdAtFinalLead
  const losingPitcherId  = state[loseSide].pitcherAtFinalLeadLost

  state[winSide].pitchers.get(winningPitcherId)!.W  = true
  state[loseSide].pitchers.get(losingPitcherId)!.L  = true

  // ── 세이브 판정 ──────────────────────────────────────────────
  // 승리팀 마지막 투수가 W 투수와 다를 경우 세이브 체크
  const lastWinPitcher = state[winSide].pitcherOrder.at(-1)!
  if (lastWinPitcher !== winningPitcherId) {
    const finalScore = state[winSide].score - state[loseSide].score
    if (finalScore <= 3) {
      state[winSide].pitchers.get(lastWinPitcher)!.SV = true
    }
  }
}
```

---

## `game/types.ts` 변경

```typescript
// GameResult에 stats 추가
export interface GameResult {
  winner:    'home' | 'away' | 'draw'
  score:     { home: number; away: number }
  linescore: { away: number[]; home: number[] }
  reason:    'normal' | 'walk_off' | 'draw'
  events:    GameEvent[]
  stats:     GameStats   // ← 신규
}
```

---

## `game/game-loop.ts` 변경

```typescript
import { calcGameStats } from './calc-game-stats'

// return 직전에 추가:
const stats = calcGameStats(allEvents, homeTeam, awayTeam)

return {
  winner, score, linescore, reason, events: allEvents,
  stats,   // ← 신규
}
```

---

## 실행 계획

**Phase 1 — 타입**
- [ ] `game/stats-types.ts`: 모든 타입 + `formatIP`, `calcBatterDerived`, `calcPitcherDerived`

**Phase 2 — 계산기**
- [ ] `game/calc-game-stats.ts`: 리듀서 + W/L/SV 후처리

**Phase 3 — 통합**
- [ ] `game/types.ts`: `GameResult.stats` 추가
- [ ] `game/game-loop.ts`: `calcGameStats` 호출 및 반환

**Phase 4 — 검증**
- [ ] `scripts/simulate-game.mjs`: 박스스코어 출력
- [ ] `npx tsc --noEmit`

---

## Risk & Rollback

| 리스크 | 대응 |
|--------|------|
| `runner_advance` 이벤트와 `at_bat_result`의 순서 의존 | `half-inning.ts` 이벤트 순서 확인 완료 — `at_bat_result` → `runner_advance` → `score` 순 보장 |
| home_run RBI 이중 계산 | `runner_advance`에서 `batter`의 `to==='home'` move 포함 → +1 별도 불필요, `runner_advance`에서 전부 처리 |
| `pickoff_out`/`caught_stealing` 아웃 수 이중 계산 | `at_bat_result`에서만 `pitcher.outs++`, `pickoff_result`에서는 처리 안 함 |
| W 투수 없는 경우 (무승부) | `winner === 'draw'` 조기 return으로 처리 |
| 순수 TS 엔진 — DB/API 영향 없음 | 롤백: `game/game-loop.ts`에서 `stats` 필드 제거만 하면 이전 상태 복원 |
