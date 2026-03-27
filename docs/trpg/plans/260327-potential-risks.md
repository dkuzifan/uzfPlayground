# 잠재적 리스크 분석
> 작성일: 2026-03-27
> 범위: UI 오버홀 (Phase 1 완료 시점) + C-2 Auth 마이그레이션 + Vertex AI Imagen 통합

---

## 🔴 Critical

### 1. Auth 흐름이 실제로 작동하는지 불확실

**문제**: C-2 작업에서 `createClient().auth.getUser()`를 모든 API에 적용했으나,
실제로 Supabase Auth로 로그인하는 UI/흐름이 구현된 적 없음.
사용자가 미인증 상태면 세션 생성·입장·캐릭터 저장 전부 401 반환.
지금 앱을 열면 아무것도 못 할 가능성이 있음.

**영향 범위**: 전체 게임 플로우 (세션 생성, 방 입장, 캐릭터 저장)

**확인 필요 사항**:
- 로비 페이지에서 인증 상태 체크 로직 존재 여부
- 미인증 사용자에 대한 로그인 유도 UI 존재 여부
- Supabase Auth 공급자 (이메일/소셜/익명) 설정 여부

**해결 방향**:
- Supabase 익명 로그인(`signInAnonymously()`)으로 최소한의 uid 발급
- 또는 로비 진입 시 PIN 인증 후 Supabase anonymous session 발급

---

### 2. Imagen API 비용 폭탄 위험

**문제**: `/api/trpg/portraits/generate`에 rate limit 없음.
인증된 사용자라면 루프 돌면서 무제한 호출 가능.
`imagen-3.0-fast-generate-001`은 이미지당 과금 구조.

**영향 범위**: GCP 청구 요금

**해결 방향**:
- 사용자당 하루 N회 제한 (Player_Character 테이블에 `portrait_generated_at` 타임스탬프 확인)
- 또는 간단히: 이미 `portrait_url`이 있으면 재생성 불가 (덮어쓰기 금지)
- 최소한: 호출 시 관리자에게 Slack/이메일 알림

---

## 🟡 High

### 3. 액세스 토큰 캐싱 없음

**문제**: `vertex-imagen.ts`에서 매 요청마다 JWT 서명 + OAuth 토큰 교환 수행.
초상화 생성 요청마다 Google OAuth 라운드트립이 추가됨.
- 추가 latency: ~200~400ms
- Google 토큰 발급 API 빈도 제한 가능성

**파일**: `src/lib/ai/vertex-imagen.ts`

**해결 방향**:
```typescript
// 모듈 레벨 캐시
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  // ... JWT 서명 + 토큰 교환
  cachedToken = { token, expiresAt: Date.now() + 3600_000 };
  return token;
}
```

---

### 4. Supabase Storage `portraits` 버킷이 자동 생성 안 됨

**문제**: `016_portrait_urls.sql` 마이그레이션을 실행해도 버킷 생성 SQL은
주석 처리돼 있어 실제로 실행되지 않음.
초상화 업로드 시 `storage/buckets/portraits not found` 에러 발생.

**파일**: `supabase/migrations/016_portrait_urls.sql`

**해결 방향**:
Supabase 대시보드 → Storage → New bucket:
- Name: `portraits`
- Public: ON (공개 읽기)
- File size limit: 5MB
- Allowed MIME types: `image/png, image/jpeg, image/webp`

---

## 🟠 Medium

### 5. `data-theme`이 Navbar에도 영향 가능성

**문제**: `body`에 `data-theme="fantasy"` 적용 시, `globals.css`의
`[data-theme="fantasy"]` 셀렉터가 Navbar 포함 전체 DOM에 영향을 줌.
현재는 `--skin-*` 변수를 `.game-screen` 클래스 내에서만 사용해 문제없지만,
Phase 2/3에서 컴포넌트에 `skin-*` 유틸리티 클래스를 붙이기 시작하면
Navbar, 모달 등에도 의도치 않게 테마가 적용될 수 있음.

**파일**: `src/app/globals.css`, `src/app/trpg/game/[sessionId]/page.tsx`

**해결 방향 (예방적)**:
게임 루트 div에 attribute를 달아 범위 제한:
```tsx
<div data-theme={scenario?.theme} className="game-screen">
  ...
</div>
```
그리고 CSS 셀렉터도:
```css
.game-screen[data-theme="fantasy"] { ... }
/* 또는 */
[data-game-theme="fantasy"] { ... }
```

---

### 6. DiceBear 외부 서비스 의존

**문제**: `Portrait.tsx` 폴백으로 `api.dicebear.com`에 실시간 요청.
- 해당 서비스 다운/지연 시 폴백 아바타도 표시 안 됨
- 캐릭터 이름(seed)이 외부 서버에 전송됨 (프라이버시)

**파일**: `src/components/trpg/game/Portrait.tsx`

**해결 방향**:
- SVG를 로컬에 번들하거나 (DiceBear의 오픈소스 라이브러리 `@dicebear/core` 사용)
- 또는 단순 이니셜 아바타(CSS 원 + 텍스트)로 완전 로컬 처리

---

## ⚪ Low

### 7. `as any` 캐스트로 인한 타입 안전성 손상

**문제**: `portrait_url` 업데이트 시 `as any` 사용.
`016_portrait_urls.sql` 마이그레이션 적용 + Supabase 타입 재생성 후에도
`as any`를 제거하지 않으면 영구적으로 타입 체크가 우회됨.

**파일**: `src/app/api/trpg/portraits/generate/route.ts` (line ~55, ~60)

**해결 방향**:
마이그레이션 실행 후:
```bash
npx supabase gen types typescript --project-id <id> > src/lib/types/database.types.ts
```
그 다음 `as any` 제거.

---

### 8. 기존 `localId` 세션 하위 호환 깨짐

**문제**: C-2 이전에 만들어진 Player_Character 레코드는
`user_id`가 랜덤 UUID(`localId`)로 저장돼 있음.
Supabase Auth uid와 달라서 새 auth 체계에서 고아 데이터가 됨.

**영향 범위**: 개발/테스트 중 만든 기존 캐릭터 레코드들

**해결 방향**:
개인 프로젝트 규모상 DB에서 기존 테스트 데이터 삭제로 정리:
```sql
DELETE FROM "Player_Character" WHERE user_id NOT IN (
  SELECT id FROM auth.users
);
```

---

## 처리 우선순위 요약

| 우선순위 | 항목 | 작업 |
|----------|------|------|
| 🔴 즉시 | Auth 흐름 확인 | 로비에서 플레이 가능한지 테스트 |
| 🔴 즉시 | Imagen 비용 제한 | portrait_url 있으면 재생성 차단 |
| 🟡 단기 | Storage 버킷 생성 | Supabase 대시보드에서 수동 생성 |
| 🟡 단기 | 토큰 캐싱 | 모듈 레벨 캐시 추가 |
| 🟠 중기 | data-theme 범위 제한 | Phase 2 시작 전 CSS 구조 개선 |
| 🟠 중기 | DiceBear 로컬화 | @dicebear/core 패키지 사용 |
| ⚪ 나중 | as any 제거 | 마이그레이션 적용 후 타입 재생성 |
| ⚪ 나중 | 고아 데이터 정리 | 테스트 데이터 DB 정리 |
