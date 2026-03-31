---
title: 야구 시뮬레이터 — 페이지 구조 및 타이틀 화면
date: 2026-03-31
owner: @dkuzifan
status: draft
---

## Context

현재 `/arena` 페이지에 야구 시뮬레이터 카드가 있지만 `soon: true`로 막혀 있다.
엔진은 완성 단계에 가깝지만 사용자가 진입할 화면이 전혀 없는 상태다.

야구 시뮬레이터 경험은 여러 단계의 화면으로 구성된다:
타이틀 → 팀 선택 → 경기장/홈원정 선택 → 프리게임 설정 → 경기 화면 → 결과

이 피처는 **전체 라우트 구조를 확정하고**, **타이틀/모드 선택 화면**을 구현하는 것을 목표로 한다.
나머지 화면들은 각각 별도 피처로 순서대로 기획/구현한다.

### 전체 페이지 플로우

```
/arena/baseball              ← [이번] 타이틀 + 모드 선택
  ├─ /setup                  ← [다음 피처] 한 경기 셋업 플로우
  │    팀 선택(캐러셀) → 경기장 선택 → 홈/원정 선택 → 프리게임 화면
  ├─ /game                   ← [별도 피처] 문자 중계 경기 화면
  └─ /season                 ← [별도 피처] 시즌 모드
```

### 경기 진행 방식 (게임 화면 기획 시 반영)
- **감독 모드**: 타석/투구마다 유저가 직접 결정 (수동)
- **풀 시뮬레이션**: 자동 진행 (속도 조절 가능)
- **진행 단위**: 타석 기준(AB별 결과) 또는 투구 기준(투구별 결과) 선택 가능

---

## MVP 범위 결정

**이번 피처**: 라우트 구조 셋업 + `/arena/baseball` 타이틀/모드 선택 화면
- `/arena/baseball` — 타이틀, 한 경기/시즌 모드 선택
- `/arena/baseball/setup`, `/arena/baseball/game`, `/arena/baseball/season` — 플레이스홀더

**이후 피처 (별도 기획/구현)**
- 팀 선택 화면 (캐러셀 + 커스텀팀)
- 경기장/홈원정 선택 화면
- 프리게임 화면 (로스터/게임 세팅)
- 게임 화면 (문자 중계)
- 시즌 모드

---

## Goals / Non-Goals

**Goals (MVP):**
- **G1** `/arena/baseball` 타이틀 화면 구현 — 야구 시뮬레이터 타이틀, 한 경기/시즌 모드 선택 버튼
- **G2** 시즌 모드 버튼: 화면에 표시하되 비활성화 + "준비 중" 배지 (로드맵 확인용)
- **G3** `/arena` 페이지의 `soon: true` 제거 — 실제 링크로 연결
- **G4** `/arena/baseball/setup`, `/game`, `/season` 플레이스홀더 페이지 생성
- **G5** 전체 라우트 디렉토리 구조 확정

**Non-Goals:**
- 팀 선택 캐러셀 UI — 별도 피처
- 게임 화면 (문자 중계) — 별도 피처
- 시즌 모드 — 별도 피처
- 실제 팀/선수 데이터 — 팀 선택 피처에서 처리

---

## Requirements

### Must-have

**R1. `/arena` 페이지 수정**
- 야구 시뮬레이터 카드의 `soon: true` 제거 → `/arena/baseball` 실제 링크로 연결

**R2. `/arena/baseball` 타이틀 화면**
- 야구 시뮬레이터 타이틀(⚾ + 제목 + 한 줄 설명)
- "한 경기 플레이" 버튼 → `/arena/baseball/setup`으로 이동
- "시즌 모드" 버튼 → 비활성화 상태, "준비 중" 배지 표시 (클릭 불가)
- 기존 프로젝트 스타일(Tailwind, 다크모드 지원) 준수

**R3. 플레이스홀더 페이지 3개**
- `/arena/baseball/setup` — "팀 선택 화면 준비 중" 또는 빈 레이아웃
- `/arena/baseball/game` — "경기 화면 준비 중"
- `/arena/baseball/season` — "시즌 모드 준비 중"
- 각 플레이스홀더에서 `/arena/baseball`로 돌아가는 뒤로가기 링크 포함

**R4. 라우트 디렉토리 구조 확정**
```
src/app/arena/baseball/
  page.tsx          ← 타이틀/모드 선택
  layout.tsx        ← 공통 레이아웃 (필요 시)
  setup/
    page.tsx        ← 플레이스홀더
  game/
    page.tsx        ← 플레이스홀더
  season/
    page.tsx        ← 플레이스홀더
```

### Nice-to-have

**N1. 배경 분위기 연출**
- 타이틀 화면에 야구장 느낌의 배경 그라디언트 또는 패턴 (구현 복잡도에 따라 선택)

---

## UX Acceptance Criteria

**UC1. 타이틀 화면 진입**
- `/arena`에서 야구 시뮬레이터 카드 클릭 시 `/arena/baseball`로 이동
- 페이지 로드 시 타이틀(⚾ + 제목 + 설명)이 즉시 표시됨

**UC2. 한 경기 플레이**
- "한 경기 플레이" 버튼 클릭 시 `/arena/baseball/setup`으로 이동
- 버튼은 항상 활성화 상태

**UC3. 시즌 모드 (비활성)**
- "시즌 모드" 버튼은 화면에 표시되나 클릭 불가
- "준비 중" 배지가 버튼 상단 우측에 표시
- 마우스 오버 시 커서가 `not-allowed`로 변경

**UC4. 플레이스홀더 페이지**
- 각 플레이스홀더에서 `/arena/baseball`로 돌아가는 뒤로가기 링크가 명확히 보임

## User Flow

```mermaid
flowchart TD
  A[/arena] -->|야구 시뮬레이터 클릭| B[/arena/baseball\n타이틀 화면]
  B -->|한 경기 플레이 클릭| C[/arena/baseball/setup\n플레이스홀더]
  B -->|시즌 모드 클릭| D[비활성 — 클릭 불가]
  C -->|뒤로가기| B
```

---

## Success Definition

- `/arena` 페이지에서 야구 시뮬레이터 클릭 시 `/arena/baseball`로 이동
- 타이틀 화면에서 "한 경기 플레이" 클릭 시 `/arena/baseball/setup`으로 이동
- "시즌 모드" 클릭 시 `/arena/baseball/season`으로 이동 (준비 중 표시)
- 기존 `/arena`, `/tales` 등 다른 페이지 영향 없음
