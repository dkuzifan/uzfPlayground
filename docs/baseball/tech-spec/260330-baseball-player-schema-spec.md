---
title: 야구 선수 데이터 스키마 - Tech Spec
date: 2026-03-30
prd: docs/baseball/prd/260330-baseball-player-schema.md
status: draft
---

## 의존성 분석 및 기술 설계

### API
- 신규 라우트 그룹 `src/app/api/baseball/` 생성 (기존 `/api/trpg/`, `/api/chat/`와 완전 독립)
- `GET /api/baseball/teams` — 팀 목록 + 소속 선수 전체 반환
- `GET /api/baseball/players?team_id=` — 팀별 선수 목록 반환
- (Nice-to-have) `GET /api/baseball/players/[id]` — 선수 단건 조회

### DB
- **신규 테이블 2개** (마이그레이션 필요, 기존 테이블 변경 없음)
  - `baseball_teams`: 팀 메타데이터
  - `baseball_players`: 선수 전체 데이터 (`stats` JSONB, `pitch_types` JSONB, `position_1/2/3` TEXT 컬럼)
- `baseball_players.team_id` → `baseball_teams.id` FK
- 기존 Supabase 테이블(`Scenario`, `NPC_Persona` 등) 의존 없음

### Domain
- 신규 `src/lib/baseball/types/player.ts` — TypeScript 타입 및 유틸 함수
  - **타입**: `Position`, `PitchType`, `Handedness`, `PitchTypeData`, `PlayerStats`, `Player`, `Team`
  - **유틸**: `is_two_way(player)`, `calcPitcherStats(pitchTypes)`
- 게임 엔진은 이번 피처 범위 밖 — 타입 정의와 데이터 적재만 완료
- JSONB 캐스팅 패턴: 기존 `NPC_Persona.stats`와 동일하게 `as PlayerStats` 명시적 캐스팅

### UI
- 이번 피처는 UI 없음 — Phase 3(HTML 목업) 스킵
- `/arena` 허브는 별도 피처에서 구현

### Release Strategy
- DB 마이그레이션 → 타입 정의 → 목 데이터 생성 → 시드 스크립트 → API 라우트 순으로 구현
- 목 데이터는 JSON 파일로 관리, 시드 스크립트는 멱등(실행 여러 번 해도 중복 없음)하게 작성

---

## 프로젝트 호환성 체크

| 항목 | 현황 | 적용 방향 |
|------|------|-----------|
| 아키텍처 | 기능별 `src/lib/{domain}/` 분리 | `src/lib/baseball/` 신규 디렉토리 |
| API 패턴 | Next.js App Router Route Handler (`route.ts`) | `src/app/api/baseball/` 동일 패턴 |
| DB | Supabase, `@supabase/ssr`, `createServiceClient()` 서버 전용 | 동일 패턴 |
| 타입 안전성 | `src/lib/types/database.ts`에 전체 DB 타입 관리 | 신규 테이블 타입 추가 |
| JSONB | `stats`, `pitch_types` → `Json` 타입 추론 | `as PlayerStats`, `as PitchTypeData[]` 캐스팅 |
| 스타일 | Tailwind v4 | 해당 없음 (UI 없음) |
| 테스트 | 없음 | 해당 없음 |

---

## Plan (Implementation Checklist)

**Step 1: DB 스키마** ← 마이그레이션 후 진행 가능
- [ ] `supabase/migrations/019_baseball_schema.sql` 작성
  - `baseball_teams` 테이블: `id UUID PK`, `name TEXT NOT NULL`, `short_name TEXT NOT NULL`, `primary_color TEXT`
  - `baseball_players` 테이블:
    - 메타: `id UUID PK`, `team_id UUID FK`, `name TEXT NOT NULL`, `number INT`, `age INT`, `bats TEXT`, `throws TEXT`, `portrait_url TEXT`
    - 포지션: `position_1 TEXT NOT NULL`, `position_2 TEXT`, `position_3 TEXT`
    - JSONB: `stats JSONB NOT NULL`, `pitch_types JSONB NOT NULL DEFAULT '[]'`
    - `zone_bottom NUMERIC`, `zone_top NUMERIC`
    - `created_at TIMESTAMPTZ DEFAULT now()`
  - `baseball_players.team_id` → `baseball_teams.id` ON DELETE CASCADE FK
  - 인덱스: `idx_baseball_players_team_id ON baseball_players(team_id)`
- [ ] Supabase 대시보드에서 SQL 실행 및 적용 확인

**Step 2: TypeScript 타입 정의** ← Step 1 완료 후
- [ ] `src/lib/baseball/types/player.ts`
  ```ts
  type Position = 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'DH' | 'UTIL'
  type PitchType = 'fastball' | 'sinker' | 'cutter' | 'slider' | 'curveball' | 'changeup' | 'splitter' | 'forkball'
  type Handedness = 'L' | 'R' | 'S'  // S = 양타

  interface PitchTypeData {
    type: PitchType
    weight: number          // 구사 비율 (합계 = 100)
    ball_power: number      // 구위
    ball_control: number    // 제구
    ball_break: number      // 변화
    ball_speed: number      // 구속
  }

  interface PlayerStats {
    // 투수 전용 (구종 가중 평균값 — 표시용)
    ball_power: number
    ball_control: number
    ball_break: number
    ball_speed: number
    // 타자 전용
    contact: number
    power: number
    defence: number
    throw: number
    running: number
    // 공통
    stamina: number
  }

  interface Player {
    id: string
    team_id: string
    name: string
    number: number
    age: number
    bats: Handedness
    throws: Handedness
    position_1: Position
    position_2: Position | null
    position_3: Position | null
    stats: PlayerStats
    pitch_types: PitchTypeData[]  // 비투수는 []
    zone_bottom: number
    zone_top: number
    portrait_url: string | null
  }

  interface Team {
    id: string
    name: string
    short_name: string
    primary_color: string
    players: Player[]
  }
  ```
- [ ] `is_two_way(player: Player): boolean`
  - `[position_1, position_2, position_3]` 중 `'P'`와 야수 포지션이 모두 있으면 `true`
- [ ] `calcPitcherStats(pitchTypes: PitchTypeData[]): Pick<PlayerStats, 'ball_power'|'ball_control'|'ball_break'|'ball_speed'>`
  - weight 합 기준 가중 평균 계산 (DB 저장 없이 런타임 계산)
  - `pitchTypes`가 빈 배열이면 `{ ball_power: 0, ball_control: 0, ball_break: 0, ball_speed: 0 }` 반환 (비투수 호출 가드)

- [ ] `src/lib/types/database.ts`에 `baseball_teams`, `baseball_players` 테이블 타입 추가
  - `stats: Json`, `pitch_types: Json` — API 응답 시 `as PlayerStats`, `as PitchTypeData[]` 캐스팅

**Step 3: 목 데이터 생성** ← Step 2 완료 후
- [ ] `src/data/baseball/mock-teams.json` 생성
  - 팀 A (예: Dragons), 팀 B (예: Tigers) 각 26명
  - 포지션 배분 (팀당):
    - 선발투수(SP) × 5
    - 불펜투수(RP) × 7
    - 포수(C) × 2
    - 내야수(1B/2B/3B/SS) × 6
    - 외야수(LF/CF/RF) × 4
    - 유틸/DH × 2
    - **투웨이 선수(P + 야수 포지션) × 1** — RP 7명 중 1명이 외야 포지션 겸임
  - 스탯 범위: 30~100 랜덤 (모든 선수 투수/타자 스탯 모두 보유)
  - 비투수 `pitch_types`: `[]`
  - `zone_bottom` / `zone_top`: 신장 기반 추정값 (예: 0.50~0.55 / 1.05~1.15, 미터 단위)
  - `number`: 1~99 중복 없이

**Step 4: 시드 스크립트** ← Step 3 완료 후
- [ ] `scripts/seed-baseball.mjs`
  - `@supabase/supabase-js` 직접 import, `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 환경변수 사용
  - `mock-teams.json` 읽기 → `baseball_teams` upsert → `baseball_players` upsert
  - **멱등 보장**: `ON CONFLICT (id) DO UPDATE` (upsert) — JSON에 UUID를 하드코딩하여 동일 id로 재실행 시 덮어씀
  - `position_1` 누락 선수 감지 시 에러 출력 후 종료
  - 실행 완료 시 팀/선수 수 출력

**Step 5: API 라우트** ← Step 4 완료 후
- [ ] `src/app/api/baseball/teams/route.ts`
  - `GET`: `baseball_teams` 전체 조회 + 각 팀의 `baseball_players` join
  - 응답: `Team[]` (players 포함), `stats` / `pitch_types`는 `as PlayerStats` / `as PitchTypeData[]` 캐스팅
- [ ] `src/app/api/baseball/players/route.ts`
  - `GET ?team_id=`: 팀 ID로 필터된 선수 목록
  - `team_id` 없으면 400 반환
- [ ] (Nice-to-have) `src/app/api/baseball/players/[id]/route.ts`
  - `GET`: 선수 단건 조회, 없으면 404

---

## 데이터 흐름 및 테이블 명세

### 테이블 구조

**`baseball_teams`**
| 컬럼 | 타입 | 제약 |
|------|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| name | TEXT | NOT NULL |
| short_name | TEXT | NOT NULL |
| primary_color | TEXT | — |
| created_at | TIMESTAMPTZ | DEFAULT now() |

**`baseball_players`**
| 컬럼 | 타입 | 제약 |
|------|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| team_id | UUID | FK → baseball_teams.id ON DELETE CASCADE |
| name | TEXT | NOT NULL |
| number | INT | — |
| age | INT | — |
| bats | TEXT | — ('L'/'R'/'S') |
| throws | TEXT | — ('L'/'R') |
| position_1 | TEXT | NOT NULL |
| position_2 | TEXT | — |
| position_3 | TEXT | — |
| stats | JSONB | NOT NULL |
| pitch_types | JSONB | NOT NULL DEFAULT '[]' |
| zone_bottom | NUMERIC | — |
| zone_top | NUMERIC | — |
| portrait_url | TEXT | — |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### 데이터 접근 패턴

```
[게임 엔진 초기화]
  GET /api/baseball/teams
    → DB: baseball_teams JOIN baseball_players
    → 응답: Team[] (players 포함, stats/pitch_types 캐스팅)
    → 메모리에 로드 후 게임 로직 전반에서 사용

[팀별 선수 조회]
  GET /api/baseball/players?team_id={id}
    → DB: baseball_players WHERE team_id = ?
    → 응답: Player[]
```

### JSONB 캐스팅 패턴
```ts
// API 응답 처리
const player = data as unknown as Player & {
  stats: Json;
  pitch_types: Json;
};
return {
  ...player,
  stats: player.stats as unknown as PlayerStats,
  pitch_types: player.pitch_types as unknown as PitchTypeData[],
};
```

---

## Risk & Rollback

**R1. 스키마 누락**
- 위험: 게임 엔진 구현 시 선수 데이터에 누락 필드 발견
- 경감: `pitch-batter-interaction.md` Section 0과 전체 교차 검토 후 확인
- 롤백: 마이그레이션 파일 추가로 대응 (ALTER TABLE)

**R2. JSONB 타입 불일치**
- 위험: `stats`, `pitch_types` Supabase 자동 추론이 `Json` → 런타임 타입 오류
- 경감: 기존 `NPC_Persona.stats` 패턴과 동일하게 `as unknown as T` 명시적 캐스팅
- 롤백: 해당 없음 (런타임 캐스팅이므로 DB 변경 불필요)

**R3. 시드 스크립트 중복 실행**
- 위험: 시드 스크립트 여러 번 실행 시 데이터 중복
- 경감: upsert(`ON CONFLICT DO UPDATE`) 사용으로 멱등 보장
- 롤백: `DELETE FROM baseball_players; DELETE FROM baseball_teams;` 후 재실행
