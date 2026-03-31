---
title: 야구 시뮬레이터 — 한 경기 셋업 플로우 Tech Spec
date: 2026-03-31
prd: docs/baseball/prd/260331-baseball-setup-flow.md
status: draft
---

## 의존성 분석 및 기술 설계

### API
- 신규 API 없음 — 순수 프론트엔드

### DB
- DB 변경 없음

### Domain — 정적 데이터 파일

**`src/lib/baseball/data/teams.ts`** (신규)
- 기존 `Team` / `Player` 타입 (`src/lib/baseball/types/player.ts`) 그대로 사용
- 팀 4개, 각 팀: 선발 투수 1 + 타자 9(포수 포함) + 불펜 2
- 더미 시즌 스탯(`era`, `whip`, `avg`, `ops`) 포함 — 프리게임 화면 표시용
  - Player 타입에 없으므로 `stats` 외에 별도 `seasonStats` 필드로 확장하거나
  - 프리게임 화면용 `PlayerWithSeasonStats` 래퍼 타입을 data 파일 안에서만 사용

**`src/lib/baseball/data/stadiums.ts`** (신규)
```typescript
export interface Stadium {
  id: string
  name: string
  location: string  // 도시명
}
export const STADIUMS: Stadium[]  // 4개
```

**`src/lib/baseball/data/game-config.ts`** (신규)
```typescript
export type GameMode   = 'manager' | 'simulation'
export type ProgressUnit = 'at_bat' | 'pitch'
export type HomeSide   = 'home' | 'away'

export interface GameConfig {
  myTeamId:     string
  oppTeamId:    string
  stadiumId:    string
  homeSide:     HomeSide
  gameMode:     GameMode
  progressUnit: ProgressUnit
}

export const GAME_CONFIG_KEY = 'baseball_game_config'

export function saveGameConfig(cfg: GameConfig): void  // localStorage
export function loadGameConfig(): GameConfig | null
```

### UI

**`src/app/arena/baseball/setup/page.tsx`** (수정 — 현재 플레이스홀더)
- 단일 페이지 컴포넌트, `useState`로 현재 스텝(`1|2|3`)과 선택값 관리
- 외부 라우팅 없이 한 페이지 내에서 스텝 전환

```typescript
// 핵심 상태
const [step, setStep]             = useState<1|2|3>(1)
const [myTeamId, setMyTeamId]     = useState<string | null>(null)
const [oppTeamId, setOppTeamId]   = useState<string | null>(null)
const [stadiumId, setStadiumId]   = useState<string | null>(null)
const [homeSide, setHomeSide]     = useState<HomeSide | null>(null)
const [gameMode, setGameMode]     = useState<GameMode | null>(null)
const [progressUnit, setProgressUnit] = useState<ProgressUnit | null>(null)
const [showStadiumModal, setShowStadiumModal] = useState(false)
```

**컴포넌트 분리 (setup/page.tsx 내 로컬 컴포넌트 or 별도 파일)**
- `StepIndicator` — 스텝 인디케이터 (1/2/3, done/active/inactive)
- `TeamCarousel` — 캐러셀 (prev/current/next 팀 표시, 팀 색상 반영)
- `StadiumModal` — 구장 선택 모달
- `RosterSection` — 프리게임 로스터 (SP + 타순 섹션 분리, 스탯 표시)

**`src/app/arena/baseball/game/page.tsx`** (수정 — 현재 플레이스홀더)
- 마운트 시 `loadGameConfig()`로 설정값 읽어서 표시
- 아직 게임 화면 미구현 → "경기 설정 확인" 화면으로 대체 (설정 요약 + 뒤로가기)

### Release Strategy
- 데이터 파일 → game-config 유틸 → setup 페이지 → game 페이지 수정 순서
- 기존 `/arena/baseball`, `/setup` 플레이스홀더 외 다른 페이지 영향 없음

---

## Plan

### Phase 1 — 데이터 파일
- [ ] `src/lib/baseball/data/teams.ts` — 팀 4개 + PlayerWithSeasonStats 타입
- [ ] `src/lib/baseball/data/stadiums.ts` — 구장 4개
- [ ] `src/lib/baseball/data/game-config.ts` — GameConfig 타입 + localStorage 유틸

### Phase 2 — 셋업 페이지 구현
- [ ] `src/app/arena/baseball/setup/page.tsx` — 스텝 상태 + Step 1/2/3 렌더링
  - Step 1: TeamCarousel × 2 (내 팀 / 상대 팀), 중복 방지
  - Step 2: 구장 선택(트리거+모달), 홈/원정, 게임 모드, 진행 단위
  - Step 3: 프리게임 로스터 (SP + 타순, ERA/WHIP·AVG/OPS), 경기 시작

### Phase 3 — 게임 페이지 연결
- [ ] `src/app/arena/baseball/game/page.tsx` — loadGameConfig() 후 설정 요약 표시

---

## Risk & Rollback

| 리스크 | 대응 |
|--------|------|
| PlayerWithSeasonStats가 엔진 타입과 충돌 | data 파일 내부에서만 사용, 엔진 import 없음 |
| localStorage 미지원 환경 | `loadGameConfig()` try-catch → null 반환 시 setup으로 redirect |
| 컴포넌트 비대화 | setup/page.tsx 300줄 초과 시 `_components/` 하위로 분리 |

롤백: 플레이스홀더 복원만으로 즉시 롤백 가능
