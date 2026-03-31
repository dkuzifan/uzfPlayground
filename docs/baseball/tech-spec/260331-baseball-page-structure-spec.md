---
title: 야구 시뮬레이터 — 페이지 구조 Tech Spec
date: 2026-03-31
prd: docs/baseball/prd/260331-baseball-page-structure.md
status: draft
---

## 의존성 분석 및 기술 설계

### API
- 신규 API 없음 — 순수 프론트엔드 라우트 추가

### DB
- DB 변경 없음

### Domain
- 도메인 로직 없음 — 정적 페이지

### UI

**수정 파일:**
- `src/app/arena/page.tsx` — 야구 카드 `soon: true` 제거, `href="#"` → `href="/arena/baseball"`, disabled 스타일 제거

**신규 파일:**
```
src/app/arena/baseball/
  page.tsx          ← 타이틀/모드 선택 화면
  layout.tsx        ← 공통 레이아웃 (min-h-screen wrapper)
  setup/
    page.tsx        ← 플레이스홀더
  game/
    page.tsx        ← 플레이스홀더
  season/
    page.tsx        ← 플레이스홀더
```

**`page.tsx` 구성 (타이틀 화면):**
- 배경: Tailwind 배경 그라디언트 클래스 (`bg-gradient-to-b` 등) — CSS 변수 없이 Tailwind만 사용
- 타이틀 블록: ⚾ 아이콘, "야구 시뮬레이터" h1, 설명 p
- 버튼 영역:
  - `<Link href="/arena/baseball/setup">한 경기 플레이</Link>` — 활성
  - `<div aria-disabled="true">시즌 모드</div>` — 비활성 (포인터 없음, opacity 낮춤), "준비 중" 배지
- 뒤로가기: `<Link href="/arena">← Arena로 돌아가기</Link>`
- 다크모드: Tailwind `dark:` prefix 사용

**플레이스홀더 3개 (공통 패턴):**
```tsx
// 예: src/app/arena/baseball/setup/page.tsx
import Link from "next/link"
export default function SetupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <p className="text-neutral-400">팀 선택 화면 준비 중</p>
      <Link href="/arena/baseball" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← 타이틀로 돌아가기
      </Link>
    </div>
  )
}
```

### Release Strategy
- DB/API 변경 없으므로 즉시 배포 가능
- `/arena` 카드 활성화 → `/arena/baseball` → 각 플레이스홀더 순서로 구현

---

## Plan

### Phase 1 — 라우트 디렉토리 구조 생성
- [ ] `src/app/arena/baseball/layout.tsx` 생성
- [ ] `src/app/arena/baseball/setup/page.tsx` 플레이스홀더 생성
- [ ] `src/app/arena/baseball/game/page.tsx` 플레이스홀더 생성
- [ ] `src/app/arena/baseball/season/page.tsx` 플레이스홀더 생성

### Phase 2 — 타이틀 화면 구현
- [ ] `src/app/arena/baseball/page.tsx` 타이틀/모드 선택 화면 구현
  - 배경 그라디언트 (초록 + 야구장 분위기)
  - 한 경기 플레이 버튼 (활성)
  - 시즌 모드 버튼 (비활성 + 준비 중 배지)
  - 뒤로가기 링크

### Phase 3 — Arena 연결
- [ ] `src/app/arena/page.tsx` — 야구 카드 `soon: true` 제거, 링크 활성화

---

## Risk & Rollback

| 리스크 | 가능성 | 대응 |
|--------|--------|------|
| 기존 `/arena` 레이아웃에 영향 | 없음 | 신규 파일만 추가, 기존 `arena/layout.tsx` 변경 없음 |
| 다른 페이지 사이드 이펙트 | 없음 | 독립적인 라우트 추가 |

롤백: 파일 삭제 + `arena/page.tsx` `soon: true` 복원으로 즉시 롤백 가능
