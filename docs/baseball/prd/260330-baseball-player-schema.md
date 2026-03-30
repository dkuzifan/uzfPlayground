---
title: 야구 선수 데이터 스키마
date: 2026-03-30
owner: @uzifan
status: draft
---

## Context

`/arena` 허브 하위에 야구 시뮬레이터를 구현한다. 시뮬레이터의 모든 게임 로직(투구, 타격, 주루, 수비 등)은 선수 데이터를 기반으로 동작하며, 이 데이터의 구조가 엔진 전반의 설계를 결정한다.

설계 원칙:
- 모든 선수는 투수 스탯 5개 + 타자 스탯 5개를 모두 보유한다 (투웨이 선수 지원).
- 투수인 선수는 `positions`에 `'P'`가 포함되고, 야수 포지션도 함께 가질 수 있다.
- 초기 데이터는 실제 KBO 데이터가 아닌 목 데이터(JSON)로 시작하되, 스키마 변경 없이 실제 KBO 데이터로 교체 가능하도록 설계한다.
- 데이터는 Supabase에 저장하고, 게임 시작 시 로드하여 메모리에서 사용한다.

기준 설계 문서: `docs/baseball/design/pitch-batter-interaction.md` (Section 0 스탯 정의, 각 섹션의 파라미터)

**선수 스탯 구성 (전체 10개 + 부가 데이터):**

| 구분 | 내부명 | 설명 |
|------|--------|------|
| 투수 전용 | BallPower | 구위 — 타구 속도에 영향 |
| 투수 전용 | BallControl | 제구 — 코스 오차 타원 크기 |
| 투수 전용 | BallBreak | 변화 — 구종별 무브먼트 양 |
| 투수 전용 | BallSpeed | 구속 — 홈까지 이동 시간 |
| 타자 전용 | Contact | 컨택 — 컨택 성공 확률 |
| 타자 전용 | Power | 파워 — 타구 속도 |
| 타자 전용 | Defence | 수비 — 낙구 예측, 포구, 태그 |
| 타자 전용 | Throw | 송구 — 거리 및 속도 |
| 타자 전용 | Running | 주루 — 베이스 이동 속도 |
| **공통** | **Stamina** | **체력 — 투구/타격/주루/수비에 의해 저하. 모든 선수 보유** |

**부가 데이터:**
- `position_1` (NOT NULL), `position_2`, `position_3` (nullable): 포지션 최대 3개를 별도 컬럼으로 관리 — DB 레벨에서 3개 제약 자연 강제, 투웨이 자동 식별
- `bats` / `throws`: 좌우타/좌우투
- `pitch_types`: 구종 목록 (투수 전용) — 각 구종이 자체 BallPower/BallControl/BallBreak/BallSpeed 값을 보유
  - 선수 전체 투수 스탯(BallPower/Control/Break/Speed)은 구종별 값을 `weight` 기준 가중 평균하여 산출
  - Stamina는 pitch_types와 무관한 선수 공통 단일 값 (투구/타격/주루/수비 모두 소모)
- `zone_bottom` / `zone_top`: 타자 체형 기반 스트라이크 존 높이
- 메타: 이름, 등번호, 나이, 팀 ID, portrait_url

**구종별 스탯 → 선수 전체 스탯 환산 예시:**
```
pitch_types = [
  { type: 'fastball',  weight: 50, ball_power: 90, ball_control: 75, ball_break: 20, ball_speed: 92 },
  { type: 'slider',    weight: 30, ball_power: 70, ball_control: 80, ball_break: 85, ball_speed: 78 },
  { type: 'changeup',  weight: 20, ball_power: 65, ball_control: 85, ball_break: 70, ball_speed: 72 },
]

// 가중 평균 (weight 합 = 100 기준)
BallPower   = (90×50 + 70×30 + 65×20) / 100 = 79.0
BallControl = (75×50 + 80×30 + 85×20) / 100 = 79.5
BallBreak   = (20×50 + 85×30 + 70×20) / 100 = 49.5
BallSpeed   = (92×50 + 78×30 + 72×20) / 100 = 83.8
```

## Goals / Non-Goals

**Goals (목표):**
- `pitch-batter-interaction.md`의 모든 스탯·파라미터를 수용하는 선수 JSON 스키마를 정의한다.
- 투웨이 선수, 좌우투타, 구종 목록, 스트라이크 존 체형 데이터를 모두 포함한다.
- TypeScript 타입을 함께 정의하여 게임 엔진 전반에서 타입 안전하게 사용한다.
- Supabase 테이블 스키마(선수, 팀)를 설계하고 마이그레이션 파일을 작성한다.
- 2팀 × 26명 규모의 목 데이터 JSON을 생성하고 DB에 적재한다. (MLB 기준 26인 로스터)

**Non-Goals (비목표):**
- 실제 KBO 선수 데이터 임포트
- 선수 생성/수정/삭제 UI
- 선수 검색·필터 기능
- 시즌 누적 스탯 트래킹 (경기 결과 기록은 별도 피처)
- 선수 이미지 생성 (portrait_url은 선언만 해둠)
- 리그별 로스터 규모 프리셋 (MLB 26명, KBO 28명 등) — 별도 피처로 분리

## Success Definition

- 선수 스키마 TypeScript 타입이 `src/lib/baseball/types/player.ts`에 정의된다.
- Supabase에 `baseball_players`, `baseball_teams` 테이블이 생성된다.
- 목 데이터 2팀 × 26명이 DB에 적재되어 `/api/baseball/players` API로 조회 가능하다.
- 게임 엔진에서 `player.stats.ball_speed` 같은 방식으로 모든 스탯에 접근 가능하다.
- 투웨이 선수는 `positions: ['P', 'RF']` 형태로 표현되며, `is_two_way()` 판별 함수가 동작한다.
- 나중에 KBO 실제 데이터로 교체 시 스키마(테이블/타입) 변경 없이 데이터만 교체 가능하다.

> **참고**: 이 피처는 UI가 없는 순수 인프라 피처로, Phase 3 (HTML 목업)은 스킵한다.

## Requirements

**Must-have (필수):**

**M1. TypeScript 타입 정의**
- [ ] `Position`, `PitchType`, `Handedness` 등 기반 타입 정의
- [ ] `PitchTypeData` 타입: `{ type, weight, ball_power, ball_control, ball_break, ball_speed }`
- [ ] `PlayerStats` 타입: 투수 전용(4) + 타자 전용(5) + 공통(Stamina) 구조
- [ ] `Player` 타입: 메타 + stats + pitch_types + positions(최대 3) + zone 높이
- [ ] `Team` 타입: 팀 메타 + 선수 목록
- [ ] `is_two_way(player)` 유틸 함수: position_1/2/3 중 'P'와 야수 포지션이 모두 있으면 true
- [ ] `calcPitcherStats(pitch_types)` 유틸 함수: 구종별 가중 평균으로 전체 투수 스탯 산출 (DB 저장 없이 런타임 계산)

**M2. DB 스키마 및 마이그레이션**
- [ ] `baseball_teams` 테이블: id, name, short_name, primary_color
- [ ] `baseball_players` 테이블: 메타 컬럼 + `stats` JSONB + `pitch_types` JSONB + `position_1` TEXT NOT NULL + `position_2` TEXT + `position_3` TEXT
- [ ] `supabase/migrations/019_baseball_schema.sql` 파일 작성
- [ ] `src/lib/types/database.ts`에 새 테이블 타입 추가

**M3. 목 데이터 생성 및 적재**
- [ ] 팀 A, 팀 B 각 26명 선수 JSON 파일 생성 (`src/data/baseball/mock-teams.json`)
  - 포지션 배분: 선발투수 5, 불펜투수 7, 포수 2, 내야수 6, 외야수 4, 유틸/DH 2
  - 투웨이 선수 각 팀 1명 포함
  - 모든 스탯 값: 30~100 범위 랜덤 생성
- [ ] DB 적재 스크립트 (`scripts/seed-baseball.mjs`)

**M4. API 라우트**
- [ ] `GET /api/baseball/teams` — 팀 목록 + 소속 선수 조회
- [ ] `GET /api/baseball/players?team_id=` — 팀별 선수 목록 조회

---

**Nice-to-have (선택):**

**N1. 선수 단건 조회**
- [ ] `GET /api/baseball/players/[id]` — 선수 상세 조회

**N2. 스탯 유효성 검사**
- [ ] 모든 스탯 값 0~100 범위 체크 유틸 (`validatePlayerStats`)
- [ ] pitch_types weight 합계 = 100 검증

## Risks

**R1. 스키마 누락**
- 게임 엔진 구현 단계에서 선수 데이터에 필요한 필드가 빠진 것을 뒤늦게 발견할 수 있음
- 대응: 구현 전 `pitch-batter-interaction.md` 전체와 교차 검토, 마이그레이션 추가로 대응

**R3. JSONB 타입 불일치**
- `stats`, `pitch_types`를 JSONB로 저장하면 Supabase가 TypeScript에서 해당 필드를 `Json` 타입으로 추론 → 실제 필드 접근 시 타입 안전성 없음
- 대응: API 응답 시 명시적 타입 캐스팅 (`as PlayerStats`) 적용, 프로젝트 내 기존 JSONB 패턴과 동일하게 처리

## UX Acceptance Criteria

<!-- UI 없는 인프라 피처 — 해당 없음 -->

## User Flows

<!-- UI 없는 인프라 피처 — 해당 없음 -->

## Plan

**Phase 1: DB 스키마** ← 마이그레이션 후 진행 가능
- [ ] `supabase/migrations/019_baseball_schema.sql` 작성 및 Supabase 적용
  - `baseball_teams` 테이블 (id, name, short_name, primary_color)
  - `baseball_players` 테이블 (메타 + position_1 NOT NULL + position_2/3 + stats JSONB + pitch_types JSONB + zone)
  - `team_id` FK, `idx_baseball_players_team_id` 인덱스

**Phase 2: TypeScript 타입** ← Phase 1 완료 후
- [ ] `src/lib/baseball/types/player.ts` 작성
  - `Position`, `PitchType`, `Handedness`, `PitchTypeData`, `PlayerStats`, `Player`, `Team` 타입
  - `is_two_way(player)` — position_1/2/3 중 'P'와 야수 포지션이 모두 있으면 true
  - `calcPitcherStats(pitchTypes)` — 가중 평균 산출, 빈 배열 가드 포함
- [ ] `src/lib/types/database.ts`에 `baseball_teams`, `baseball_players` 테이블 타입 추가

**Phase 3: 목 데이터** ← Phase 2 완료 후
- [ ] `src/data/baseball/mock-teams.json` 생성 — 2팀 × 26명
  - 팀당 포지션 배분: SP×5, RP×7(이 중 1명 투웨이), C×2, 내야수×6, 외야수×4, Util/DH×2
  - 스탯 30~100 랜덤, UUID 하드코딩 (멱등 시드를 위해)
- [ ] `scripts/seed-baseball.mjs` 작성 — upsert, position_1 누락 시 에러 출력

**Phase 4: API 라우트** ← Phase 3 완료 후
- [ ] `src/app/api/baseball/teams/route.ts` — `GET` 팀 + 소속 선수 전체
- [ ] `src/app/api/baseball/players/route.ts` — `GET ?team_id=` 팀별 선수 목록
- [ ] (Nice-to-have) `src/app/api/baseball/players/[id]/route.ts` — `GET` 선수 단건

**검증**
- [ ] 빌드 통과 (`next build`)
- [ ] `/api/baseball/teams` 응답에서 `player.stats.ball_speed` 접근 가능
- [ ] 투웨이 선수에 `is_two_way()` 호출 시 `true` 반환

## Data Flow & Risk

### 데이터 흐름

```
[게임 엔진 초기화]
  GET /api/baseball/teams
    → DB: baseball_teams JOIN baseball_players (team_id 기준)
    → stats: Json → as PlayerStats 캐스팅
    → pitch_types: Json → as PitchTypeData[] 캐스팅
    → 반환: Team[] (players 포함)
    → 게임 엔진 메모리에 로드 후 경기 전 과정에서 사용

[팀별 선수 조회]
  GET /api/baseball/players?team_id={id}
    → DB: baseball_players WHERE team_id = $1
    → 반환: Player[]
```

### 테이블 명세

| 테이블 | Read | Write |
|--------|------|-------|
| `baseball_teams` | GET /api/baseball/teams | seed 스크립트 (최초 1회) |
| `baseball_players` | GET /api/baseball/teams, GET /api/baseball/players | seed 스크립트 (최초 1회) |

### Risk & Rollback

| # | 위험 | 경감 방안 | 롤백 |
|---|------|-----------|------|
| R1 | 스키마 누락 — 게임 엔진 구현 시 필요한 필드 발견 | 구현 전 `pitch-batter-interaction.md` 전체 교차 검토 | ALTER TABLE 마이그레이션 추가 |
| R2 | JSONB 타입 불일치 — `stats`, `pitch_types`가 `Json`으로 추론됨 | `as unknown as T` 명시적 캐스팅 (기존 NPC_Persona.stats 패턴 동일) | DB 변경 불필요, 캐스팅 코드 수정 |
| R3 | 시드 중복 — 스크립트 재실행 시 데이터 중복 | UUID 하드코딩 + `ON CONFLICT DO UPDATE` (upsert) | `DELETE FROM baseball_players; DELETE FROM baseball_teams;` 후 재실행 |
