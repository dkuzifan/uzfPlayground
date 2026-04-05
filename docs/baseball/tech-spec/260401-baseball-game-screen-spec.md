---
title: 야구 게임 화면 — Tech Spec
date: 2026-04-01
feature: baseball-game-screen
prd: docs/baseball/prd/260331-baseball-game-screen.md
status: draft
---

## 1. Overview

`/arena/baseball/game` 페이지를 현재 플레이스홀더에서 완전한 게임 화면으로 교체한다.
`runGame()`이 반환하는 `GameEvent[]`를 순서대로 공개하는 **이벤트 플레이백 UI**를 구현한다.

---

## 2. 수정/생성 파일 목록

### 수정
| 파일 | 변경 내용 |
|------|-----------|
| `src/app/arena/baseball/game/page.tsx` | 플레이스홀더 → 전체 게임 UI |

### 생성
| 파일 | 역할 |
|------|------|
| `src/hooks/baseball/useGamePlayback.ts` | 플레이백 상태 머신 훅 |
| `src/lib/baseball/game/derive-state.ts` | GameEvent[] → LiveGameState 파생 |
| `src/lib/baseball/game/build-lineup.ts` | TeamWithStats → runGame 입력 형식 변환 |
| `src/lib/baseball/game/pbp-text.ts` | GameEvent → 한국어 문자 중계 텍스트 |

---

## 3. 데이터 흐름

```
page mount
  → loadGameConfig() : GameConfig | null
      없음 → redirect /arena/baseball/setup
      있음 ↓
  → buildLineup(getTeamById(homeTeamId))  →  { lineup, pitcher, bullpen }
  → buildLineup(getTeamById(awayTeamId))  →  { lineup, pitcher, bullpen }
  → runGame(homeTeam, awayTeam)           →  GameResult { events, stats, ... }
  → useGamePlayback(events, config)       →  PlaybackState
      ↓
  LiveGameState (deriveState(events, revealedCount))
      ↓
  UI 렌더링 (ScoreBanner / ZoneBlock / PBPLog / BoxTab / ResultScreen)
```

---

## 4. buildLineup

**파일**: `src/lib/baseball/game/build-lineup.ts`

```typescript
import type { Player } from '../types/player'
import type { TeamWithStats } from '../data/teams'

export interface LineupTeam {
  lineup:  Player[]
  pitcher: Player
  bullpen: Player[]
}

export function buildLineup(team: TeamWithStats): LineupTeam {
  // players[0] = SP, players[1..9] = batters (including catcher)
  const pitcher = team.players[0]
  const lineup  = team.players.slice(1)   // 9명
  const bullpen = team.bullpen ?? []
  return { lineup, pitcher, bullpen }
}
```

홈/원정 판단: `GameConfig.homeSide === 'home'` 이면 myTeam이 홈.

---

## 5. LiveGameState 파생 (derive-state.ts)

`revealedEvents` (공개된 이벤트 배열)를 순서대로 스캔해 현재 게임 상태를 계산한다.

```typescript
export interface PitchDot {
  num:    number           // 타석 내 투구 순서 (1-based)
  zoneX:  number           // zone-visual 기준 left % (0~100)
  zoneY:  number           // zone-visual 기준 top %  (0~100)
  result: 'ball' | 'strike' | 'foul' | 'inplay'
  isLatest: boolean
}

export interface LiveGameState {
  score:     { home: number; away: number }
  inning:    number
  isTop:     boolean
  outs:      number
  runners:   { first: boolean; second: boolean; third: boolean }
  count:     { balls: number; strikes: number }
  currentPitcher: Player
  currentBatter:  Player
  onDeck:         Player
  pitchDots:      PitchDot[]   // 현재 타석 투구 위치 (타석 변경 시 리셋)
}
```

**PitchResult → (zoneX%, zoneY%) 변환**:

`pitch` 이벤트 payload의 `pitch.actual_x` (m, 홈플레이트 중심 기준)·`pitch.actual_z` (m, 지면 기준)를 사용한다.
ZoneId 기반 고정 좌표 대신 연속 좌표 변환으로 정확한 위치를 표시한다.

```typescript
const ZONE_HALF_WIDTH = 0.215   // 홈플레이트 절반 (m)
const ZONE_TOP    = 1.20        // player.zone_top 기본값 (m)
const ZONE_BOTTOM = 0.55        // player.zone_bottom 기본값 (m)

// zone-visual: zone-rect = left 25%~75%, top 8.5%~80.5%
function toZonePercent(x: number, z: number): { left: number; top: number } {
  const left = clamp(50 + (x / ZONE_HALF_WIDTH) * 25, 5, 95)
  const top  = clamp(8.5 + ((ZONE_TOP - z) / (ZONE_TOP - ZONE_BOTTOM)) * 72, 2, 98)
  return { left, top }
}
```

**타석 리셋**: `at_bat_result` 이벤트 감지 시 `pitchDots` 초기화

---

## 6. useGamePlayback 훅

**파일**: `src/hooks/baseball/useGamePlayback.ts`

```typescript
type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'ended'
type Speed = 'slow' | 'normal' | 'fast'

const SPEED_MS: Record<Speed, number> = {
  slow:   3000,
  normal: 1500,
  fast:    500,
}

interface PlaybackState {
  status:        PlaybackStatus
  revealedCount: number
  speed:         Speed
  liveState:     LiveGameState
  pbpGroups:     PBPGroup[]     // 렌더링용 이닝별 그룹
  result:        GameResult | null
}

interface PlaybackActions {
  pause:    () => void
  resume:   () => void
  next:     () => void           // 일시정지 중 수동 1단위 진행
  setSpeed: (s: Speed) => void
}
```

**진행 단위 (`progressUnit`)**:
- `pitch`: 이벤트 하나씩 (`revealedCount += 1`)
- `at_bat`: `at_bat_result` 이벤트까지의 그룹을 한 번에 공개

**단위 계산**:
```typescript
function nextUnitEnd(events: GameEvent[], from: number, unit: ProgressUnit): number {
  if (unit === 'pitch') return from + 1
  // at_bat: from 이후 첫 at_bat_result 위치까지
  for (let i = from; i < events.length; i++) {
    if (events[i].type === 'at_bat_result') return i + 1
  }
  return events.length
}
```

**자동 재생**: `useInterval`로 `SPEED_MS[speed]` 마다 `next()` 호출. `status === 'playing'`일 때만 동작.

**게임 종료**: `game_end` 이벤트가 공개되면 `status = 'ended'`.

---

## 7. pbp-text.ts — 한국어 문자 중계

```typescript
export function pitchToText(e: GameEvent): string
export function atBatResultToText(e: GameEvent): { title: string; sub?: string }
export function pitchChangeToText(e: GameEvent): string
```

주요 케이스:
| 이벤트/결과 | 텍스트 예시 |
|-------------|-------------|
| pitch (볼) | `볼 — 92km 포심패스트볼` |
| pitch (헛스윙) | `헛스윙 — 87km 슬라이더` |
| pitch (파울) | `파울 — 84km 체인지업` |
| at_bat_result (H) | `안타 — 좌중간 안타` |
| at_bat_result (HR) | `홈런 — 우중간 솔로 홈런` |
| at_bat_result (SO) | `삼진 아웃 — 루킹` |
| at_bat_result (BB) | `볼넷 — 출루` |
| at_bat_result (DP) | `병살 — 내야 땅볼` |
| pitching_change | `투수 교체 → {incoming.name}` |

---

## 8. PBP 렌더링 구조

```typescript
interface PBPGroup {
  inning:   number
  isTop:    boolean
  isActive: boolean   // 현재 진행 중인 이닝
  summary:  string    // 종료 이닝: "1안타 · 0득점"
  atBats:   AtBatGroup[]
}

interface AtBatGroup {
  batterName:  string
  batterOrder: number   // 타순 (1-9)
  isActive:    boolean  // 현재 진행 중 타석
  pitches:     PitchRow[]
  result:      ResultRow | null
  pitchChange: string | null   // 이 타석 앞에 투수 교체가 있었다면
}
```

---

## 9. page.tsx 컴포넌트 구조

```
GamePage (Client, 단일 파일)
├── ScoreBanner          props: score, inning, isTop, homeTeam, awayTeam
├── Tabs                 props: activeTab, onSwitch
│
├── [Live Tab]
│   ├── live-body (flex row on desktop 6:4)
│   │   ├── live-left (게임뷰)
│   │   │   ├── ZoneStatus    props: inning, isTop, outs
│   │   │   ├── ZoneVisual    props: pitchDots
│   │   │   ├── ZoneFooter    props: runners, count
│   │   │   ├── MatchupBar    props: pitcher, batter, onDeck
│   │   │   └── ControlBar    props: status, speed, onPause, onResume, onNext, onSetSpeed
│   │   └── PBPLog
│   │       └── InnSection[]  props: group, defaultOpen=isActive
│   │           └── AtBatGroup[]
│   │               └── PitchRow[]
│
└── [Box Tab]
    ├── Linescore         props: linescore, homeTeam, awayTeam
    ├── BatterTable × 2   props: stats[], teamName, color
    └── PitcherTable × 2

ResultScreen (game_end 감지 후 렌더)
├── ResultCard            props: score, winner, reason
├── Linescore
├── PitcherTable
└── ResultButtons         → setup / title
```

모든 컴포넌트는 page.tsx 내 로컬 함수 컴포넌트로 선언 (별도 파일 분리 없음 — 재사용 대상 아님).

---

## 10. 구현 Plan

### Phase A — 엔진 연결 + 기본 UI 뼈대
- [ ] `build-lineup.ts` 구현 (players[0] = SP 가정, 주석 명시)
- [ ] `page.tsx`: GameConfig 로드 → redirect 처리
- [ ] 로딩 상태: `runGame()` 호출 전 스피너 표시 (`useEffect` + `useState('loading')`)
- [ ] `GameResult` 생성 후 상태 저장
- [ ] ScoreBanner, Tabs, ControlBar 뼈대 렌더

### Phase B — ZoneBlock + LiveGameState
- [ ] `derive-state.ts` 구현 (ZoneId → % 좌표 포함)
- [ ] `useGamePlayback.ts` 구현 (자동재생 + 수동 next)
- [ ] ZoneVisual (pitch dots), ZoneStatus, ZoneFooter, MatchupBar 렌더

### Phase C — PBP 로그
- [ ] `pbp-text.ts` 구현
- [ ] PBP 이닝별 그룹화 + 타석 헤더
- [ ] 이닝 토글 (완료 이닝 닫힘, 현재 이닝 열림)
- [ ] 새 이벤트 추가 시 자동 스크롤

### Phase D — Box 탭 + 결과 화면
- [ ] Box 탭: Linescore + BatterTable + PitcherTable
- [ ] IP 표시: `PitcherGameStats.outs` → `Math.floor(outs/3) + '.' + (outs%3)` 변환
- [ ] ResultScreen: game_end 감지 후 전환
- [ ] 끝내기(walk_off) 배지
- [ ] 다시하기 / 타이틀 버튼

---

## 11. Risk & Rollback

| 리스크 | 대응 |
|--------|------|
| `runGame()` 실행 시간이 UI 블로킹 | `useEffect` 내에서 동기 실행 → 충분히 빠름(순수 JS). 느리면 Web Worker 이전 |
| ZoneId → % 좌표 매핑 오류 | 좌표 매핑 테이블을 상수로 정의, 시각적으로 검증 후 고정 |
| `progressUnit = at_bat` 시 단위 경계 오계산 | `nextUnitEnd` 함수 단위 테스트로 검증 |
| 결과 화면 미전환 | `game_end` 이벤트가 마지막 이벤트임을 엔진 코드로 확인 완료 |

**Rollback**: game/page.tsx만 수정되므로, 문제 시 기존 플레이스홀더 코드로 즉시 복원 가능. 다른 페이지 영향 없음.
