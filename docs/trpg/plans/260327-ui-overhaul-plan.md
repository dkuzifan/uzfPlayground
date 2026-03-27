# UI 오버홀 + 모바일 대응 + 초상화 생성 설계 문서
> 작성일: 2026-03-27
> 범위: C-3 (모바일 반응형) + UI 전면 개선 + Vertex AI 초상화 생성

---

## 1. 왜 이 작업이 필요한가

현재 게임 화면은 "웹 앱 대시보드"처럼 보입니다.
버튼, 카드, 모달 — 어드민 패널의 언어이지, 게임의 언어가 아닙니다.

**목표**: 인터페이스 자체가 세계관의 일부처럼 느껴지도록.
텍스트가 주인공이고, 나머지는 텍스트를 돋보이게 하는 조연.

---

## 2. 설계 원칙

| 원칙 | 설명 |
|------|------|
| **텍스트 우선** | 내러티브 로그가 화면의 중심. 나머지는 보조 |
| **시나리오가 분위기를 결정** | fantasy / mystery / horror / sci-fi 테마마다 다른 색상·폰트 |
| **모바일은 처음부터** | 추가가 아닌 설계의 일부 |
| **애니메이션은 의미를 가져야** | 장식용 애니메이션 금지. 주사위·선택지·Lore 발견만 |
| **점진적 구현** | 기존 컴포넌트를 교체하는 방식. 한 번에 전부 갈아엎지 않음 |

---

## 3. 추가할 기술

현재 스택(Next.js + Tailwind CSS v4)은 유지합니다. 아래 두 가지만 추가:

### 3-1. Framer Motion
```bash
npm install framer-motion
```
- 선택지 카드 등장/퇴장 애니메이션
- 주사위 굴리기 연출
- Lore 스크롤 펼치기
- 패널 슬라이드 인/아웃 (모바일)

### 3-2. Vertex AI Imagen (초상화 생성)
```bash
npm install @google-cloud/aiplatform
```
→ 별도 섹션(7번)에서 상세 설명

---

## 4. 시나리오 스킨 시스템

게임 세션이 시작될 때, 시나리오 테마에 맞는 CSS 변수를 `<body>`에 적용합니다.
컴포넌트 코드는 변경 없이, 변수값만 바꿔서 완전히 다른 분위기를 만듭니다.

### 4-1. CSS 변수 정의 (`globals.css`)

```css
/* 기본 (로비, 로그인 등 게임 외 화면) */
:root {
  --skin-bg:          #0f0f11;
  --skin-bg-secondary:#18181b;
  --skin-border:      rgba(255,255,255,0.08);
  --skin-accent:      #a3a3a3;
  --skin-accent-glow: rgba(163,163,163,0.15);
  --skin-text:        #e5e5e5;
  --skin-text-muted:  #737373;
  --skin-font-display: 'Inter', sans-serif;
  --skin-font-body:    'Inter', sans-serif;
}

/* fantasy 테마 */
[data-theme="fantasy"] {
  --skin-bg:          #110d07;
  --skin-bg-secondary:#1c1409;
  --skin-border:      rgba(201,168,76,0.15);
  --skin-accent:      #c9a84c;
  --skin-accent-glow: rgba(201,168,76,0.20);
  --skin-text:        #f0e6d3;
  --skin-text-muted:  #8a7a62;
  --skin-font-display: 'Cinzel', serif;        /* 구글 폰트 */
  --skin-font-body:    'Crimson Text', serif;
}

/* mystery 테마 */
[data-theme="mystery"] {
  --skin-bg:          #0a0a0c;
  --skin-bg-secondary:#111116;
  --skin-border:      rgba(147,197,253,0.10);
  --skin-accent:      #93c5fd;
  --skin-accent-glow: rgba(147,197,253,0.15);
  --skin-text:        #e2e8f0;
  --skin-text-muted:  #64748b;
  --skin-font-display: 'Special Elite', monospace;
  --skin-font-body:    'Lora', serif;
}

/* horror 테마 */
[data-theme="horror"] {
  --skin-bg:          #080608;
  --skin-bg-secondary:#100c10;
  --skin-border:      rgba(139,26,26,0.20);
  --skin-accent:      #dc2626;
  --skin-accent-glow: rgba(220,38,38,0.15);
  --skin-text:        #d4d4d4;
  --skin-text-muted:  #6b6b6b;
  --skin-font-display: 'Creepster', cursive;
  --skin-font-body:    'IM Fell English', serif;
}

/* sci-fi 테마 */
[data-theme="sci-fi"] {
  --skin-bg:          #050810;
  --skin-bg-secondary:#080d18;
  --skin-border:      rgba(34,211,238,0.12);
  --skin-accent:      #22d3ee;
  --skin-accent-glow: rgba(34,211,238,0.15);
  --skin-text:        #e0f2fe;
  --skin-text-muted:  #4b6a7a;
  --skin-font-display: 'Orbitron', sans-serif;
  --skin-font-body:    'Share Tech Mono', monospace;
}
```

### 4-2. 테마 적용 방법

게임 페이지(`/trpg/game/[sessionId]/page.tsx`)에서:
```typescript
// 시나리오 테마가 로드되면 body에 data-theme 적용
useEffect(() => {
  if (scenario?.theme) {
    document.body.setAttribute("data-theme", scenario.theme);
    return () => document.body.removeAttribute("data-theme");
  }
}, [scenario?.theme]);
```

### 4-3. 컴포넌트에서 사용

```tsx
// Tailwind arbitrary value로 CSS 변수 참조
<div className="bg-[var(--skin-bg)] text-[var(--skin-text)] border-[var(--skin-border)]">
  <h2 className="font-[var(--skin-font-display)] text-[var(--skin-accent)]">
    제목
  </h2>
</div>
```

---

## 5. 게임 화면 레이아웃 재설계

### 5-1. 데스크탑 (md 이상)

```
┌──────────────────────────────────────────────────────────────────┐
│  [좌 패널 260px]        [중앙, flex-1]          [우 패널 280px]  │
│                                                                  │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │ 내 캐릭터    │    │                  │    │ NPC 감정 패널 │  │
│  │ 초상화       │    │  내러티브 로그   │    │               │  │
│  │ 이름/직업    │    │  (ChatLog)       │    │ 퀘스트        │  │
│  │ HP 바        │    │                  │    │ 트래커        │  │
│  │              │    │  스크롤          │    │               │  │
│  ├──────────────┤    │                  │    │ Lore 목록     │  │
│  │ 플레이어 목록│    │                  │    │               │  │
│  │ (미니 카드)  │    │                  │    │ [GM 패널]     │  │
│  │              │    ├──────────────────┤    │               │  │
│  ├──────────────┤    │ 씬 페이즈 바     │    └───────────────┘  │
│  │ 환경 정보    │    ├──────────────────┤                        │
│  │ 날씨/시간    │    │ 선택지 카드 영역 │                        │
│  └──────────────┘    │ (ActionPanel)    │                        │
│                      └──────────────────┘                        │
└──────────────────────────────────────────────────────────────────┘
```

**핵심 변경사항:**
- 좌 패널: 캐릭터 초상화 + 플레이어 목록을 세로로 통합
- 중앙: 내러티브 로그가 전체 높이 차지. 하단에 선택지 고정
- 우 패널: 기존 사이드바 패널들 유지, 순서 재배치

### 5-2. 모바일 (md 미만)

```
┌─────────────────────┐
│  [씬 페이즈] [환경]  │  ← 상단 바 (32px)
├─────────────────────┤
│                     │
│   내러티브 로그     │  ← 전체 높이 차지
│   (ChatLog)         │
│   스크롤            │
│                     │
├─────────────────────┤
│   선택지 / 행동     │  ← ActionPanel (고정)
├─────────────────────┤
│  📖  👤  🎭  🗺  ⚙  │  ← 하단 탭 바 (56px)
└─────────────────────┘
        ↓ 탭 선택 시 bottom sheet 슬라이드업
┌─────────────────────┐
│  ───────────────    │  ← 드래그 핸들
│  [탭 내용]          │
│  (캐릭터/NPC/퀘스트 │
│   /Lore/GM)         │
└─────────────────────┘
```

**모바일 탭 구성:**
| 아이콘 | 탭 이름 | 내용 |
|--------|---------|------|
| 📖 | 스토리 | 기본 화면 (로그 + 선택지) |
| 👤 | 캐릭터 | CharacterStatus + PlayerList |
| 🎭 | NPC | NpcEmotionPanel |
| 🗺 | 퀘스트 | QuestTrackerPanel + LoreDiscoveryPanel |
| ⚙ | GM | GmPanel (호스트만 표시) |

---

## 6. 컴포넌트별 상세 재설계

### 6-1. 내러티브 로그 (ChatLog)

**현재**: Discord 스타일 메시지 목록
**변경**: 말하는 주체마다 시각적 언어가 다름

```
┌─────────────────────────────────────┐
│ GM 서술 — 산문체, 전체 너비, 이탤릭  │
│ ┄┄┄┄┄┄ 구분선 ┄┄┄┄┄┄              │
│                                     │
│    [NPC 초상화 36px]                │
│    "NPC 대화 — 좌측 정렬,           │  ← 말풍선 스타일
│     accent 색상 테두리"             │
│                                     │
│              "플레이어 행동 — 우측, │  ← 이탤릭 인용구
│              중립 색상"             │
│                                     │
│ ╔══════════════════════════════╗    │
│ ║ 📜 새로운 단서 발견          ║    │  ← Lore 카드 (기존 유지)
│ ╚══════════════════════════════╝    │
└─────────────────────────────────────┘
```

**구현 포인트:**
- `speaker_type === "gm"`: 중앙 정렬, 이탤릭, 약간 큰 폰트
- `speaker_type === "npc"`: 좌측, 초상화 + 말풍선
- `speaker_type === "player"`: 우측, 다른 색
- `speaker_type === "system"`: 중앙, 작은 폰트, muted 색상
- 새 메시지 등장 시 Framer Motion `fadeInUp` (0.3초)

### 6-2. 선택지 카드 (ActionPanel)

**현재**: 버튼 3개
**변경**: 물리적 카드 3장

```
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │          │  │          │  │          │
  │  선택지  │  │  선택지  │  │  선택지  │
  │    1     │  │    2     │  │    3     │
  │          │  │          │  │          │
  │ [난이도] │  │ [난이도] │  │ [난이도] │
  └──────────┘  └──────────┘  └──────────┘

  hover: 카드가 위로 6px 이동 (transform translateY)
  click: 카드 앞면 → 뒤면 flip → 사라짐
```

**Framer Motion 예시:**
```tsx
<motion.div
  whileHover={{ y: -6, boxShadow: "0 12px 40px var(--skin-accent-glow)" }}
  whileTap={{ scale: 0.97 }}
  onClick={handleSelect}
>
  {카드 내용}
</motion.div>
```

### 6-3. 주사위 연출 (DiceRollOverlay)

**현재**: 팝업 오버레이
**변경**: 3단계 드라마

```
1단계: 배경 어둡게 (0.5초) + 화면 중앙에 주사위만 조명
2단계: 주사위 굴리는 애니메이션 (회전, 0.8초)
3단계: 결과 reveal
  - 대성공(18+): 화면 전체에 금빛 파티클 + 텍스트 확대
  - 성공(11-17): 녹색 glow
  - 실패(10-): 빨간 떨림 (shake animation)
```

### 6-4. NPC 감정 패널 (NpcEmotionPanel)

**현재**: NPC 이름 + 숫자 슬라이더 목록
**변경**: 초상화 카드 + 감정 색상

```
┌─────────────────────┐
│ [초상화 40x40]      │
│ NPC 이름     [역할] │
│                     │
│ 호감 ████░░ +45     │  ← 색상으로 감정 표현
│ 신뢰 ███░░░ +30     │     (양수=초록, 음수=빨강)
│ 공포 █░░░░░  10     │
└─────────────────────┘
```

숫자는 hover 시에만 표시. 평소엔 바 색상으로만 파악.

### 6-5. 턴 인디케이터 (TurnIndicator)

**현재**: 텍스트 배지
**변경**: 내 턴일 때 pulse 애니메이션 + 강조

```tsx
// 내 턴
<motion.div
  animate={{ opacity: [1, 0.6, 1] }}
  transition={{ duration: 1.5, repeat: Infinity }}
  className="rounded-full bg-[var(--skin-accent)] px-4 py-1 text-sm font-bold"
>
  ⚡ 당신의 턴
</motion.div>

// 다른 사람 턴
<div className="text-[var(--skin-text-muted)]">
  {playerName}의 턴...
</div>
```

---

## 7. Vertex AI 초상화 생성

### 7-1. 개요

| 항목 | 내용 |
|------|------|
| 서비스 | Google Cloud Vertex AI |
| 모델 | `imagen-3.0-fast-generate-001` (저렴, 빠름) |
| 폴백 | `imagegeneration@006` (Imagen 2, 더 저렴) |
| 저장소 | Supabase Storage (`portraits` 버킷) |
| 생성 시점 | 캐릭터 생성 직후 백그라운드 |
| 비용 | Imagen 3 Fast: ~$0.01/장, Imagen 2: ~$0.002/장 |

### 7-2. GCP 설정 절차

```
1. console.cloud.google.com 접속
2. 새 프로젝트 생성 (또는 기존 프로젝트 사용)
3. Vertex AI API 활성화
4. IAM → 서비스 계정 생성
   - 역할: "Vertex AI User"
5. 서비스 계정 → 키 생성 (JSON 다운로드)
6. JSON 내용을 base64로 인코딩 → .env.local에 저장
```

**.env.local 추가:**
```
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS_BASE64=eyJ0eXBlIjoi...  # JSON 키 base64
```

### 7-3. 프롬프트 전략

**플레이어 캐릭터 프롬프트:**
```typescript
function buildPlayerPrompt(job: string, dndAlignment: string, theme: string): string {
  const themeStyle: Record<string, string> = {
    fantasy:  "oil painting, fantasy art, epic lighting",
    mystery:  "noir illustration, film noir, atmospheric shadows",
    horror:   "dark gothic art, haunting, dramatic contrast",
    "sci-fi": "digital art, cyberpunk aesthetic, neon lighting",
  };

  return [
    `Portrait of a ${job} character.`,
    `${dndAlignment} alignment.`,
    `${theme} setting.`,
    "Head and shoulders portrait, facing slightly left.",
    themeStyle[theme] ?? "detailed digital painting",
    "Cinematic lighting. No text. No watermark. No border.",
  ].join(" ");
}
```

**NPC 프롬프트 (appearance 필드 활용):**
```typescript
function buildNpcPrompt(appearance: string, role: string, theme: string): string {
  const themeStyle: Record<string, string> = {
    fantasy:  "oil painting, fantasy RPG character art",
    mystery:  "noir illustration, moody lighting",
    horror:   "dark gothic illustration, horror atmosphere",
    "sci-fi": "sci-fi character art, digital painting",
  };

  return [
    `Portrait of: ${appearance}`,  // NPC appearance 필드 그대로 사용
    `Role: ${role}.`,
    themeStyle[theme] ?? "detailed character portrait",
    "Head and shoulders. Cinematic lighting. No text. No watermark.",
  ].join(" ");
}
```

### 7-4. API 라우트

**`/api/trpg/portraits/generate` (POST)**

```
요청: { type: "player" | "npc", id: string, theme: string }
처리:
  1. DB에서 캐릭터/NPC 정보 조회
  2. 프롬프트 생성
  3. Vertex AI 호출 (Imagen)
  4. 응답 이미지(base64) → Supabase Storage 업로드
  5. DB에 portrait_url 업데이트
응답: { portrait_url: string }
```

### 7-5. DB 변경사항

**마이그레이션 필요:**
```sql
-- Player_Character에 초상화 URL 추가
ALTER TABLE "Player_Character"
  ADD COLUMN IF NOT EXISTS portrait_url TEXT DEFAULT NULL;

-- NPC_Persona에 초상화 URL 추가
ALTER TABLE "NPC_Persona"
  ADD COLUMN IF NOT EXISTS portrait_url TEXT DEFAULT NULL;
```

**Supabase Storage:**
- 버킷 이름: `portraits`
- 파일 경로: `player/{player_id}.webp`, `npc/{npc_id}.webp`
- 공개 읽기 권한 (게임 화면에서 직접 URL로 접근)

### 7-6. 생성 플로우

```
[캐릭터 생성 완료]
      │
      ▼
[DB에 Player_Character INSERT]
      │
      ▼ (즉시 반환, 비동기)
[게임/대기실 화면 진입]    [백그라운드: /api/trpg/portraits/generate 호출]
      │                          │
      │                          ▼
      │                   [Vertex AI 이미지 생성 ~3초]
      │                          │
      │                          ▼
      │                   [Supabase Storage 업로드]
      │                          │
      │                          ▼
      │                   [DB portrait_url 업데이트]
      │                          │
      ▼                          ▼
[placeholder 표시]       [Realtime으로 portrait_url 수신]
                                 │
                                 ▼
                         [초상화 이미지 표시]
```

**placeholder 처리:**
```tsx
// portrait_url 없을 때: DiceBear SVG fallback
const portraitSrc = portrait_url
  ?? `https://api.dicebear.com/9.x/adventurer/svg?seed=${character_name}_${job}`;
```

---

## 8. 구현 단계 (Phase별)

### Phase 1 — 기반 작업 (이것부터)
- [ ] Framer Motion 설치
- [ ] `@next/font`로 Google Fonts 5종 추가 (Cinzel, Crimson Text, Special Elite, Orbitron 등)
- [ ] CSS 변수 시스템 (`globals.css`) 작성
- [ ] 게임 페이지에서 `data-theme` 적용 로직 추가
- [ ] Supabase Storage `portraits` 버킷 생성
- [ ] DB 마이그레이션 (portrait_url 컬럼 추가)

### Phase 2 — 게임 화면 레이아웃
- [ ] 데스크탑 3단 레이아웃 재설계 (현재 구조 기반으로 개선)
- [ ] 모바일 하단 탭 바 + bottom sheet 구현
- [ ] 좌 패널: 캐릭터 초상화 공간 추가

### Phase 3 — 핵심 컴포넌트 교체
- [ ] ChatLog: GM/NPC/Player 말풍선 스타일 분리
- [ ] ActionPanel: 카드 UI + Framer Motion
- [ ] DiceRollOverlay: 3단계 드라마 연출
- [ ] NpcEmotionPanel: 초상화 카드 스타일
- [ ] TurnIndicator: pulse 애니메이션

### Phase 4 — Vertex AI 초상화
- [ ] GCP 설정 + 환경변수
- [ ] `/api/trpg/portraits/generate` 라우트 구현
- [ ] 캐릭터 생성 완료 시 백그라운드 생성 트리거
- [ ] NPC 소개 시 백그라운드 생성 트리거
- [ ] Realtime으로 portrait_url 수신 + 표시

### Phase 5 — 로비 / 온보딩
- [ ] 로비 카드 UI 개선
- [ ] 대기실 개선
- [ ] 온보딩 폰트/색상 적용

---

## 9. 파일 변경 예상 목록

### 새로 생성
```
src/app/api/trpg/portraits/generate/route.ts   ← Vertex AI 초상화 생성
src/lib/ai/vertex-imagen.ts                    ← Vertex AI 클라이언트
src/components/trpg/game/Portrait.tsx           ← 초상화 컴포넌트 (with fallback)
src/components/trpg/game/MobileTabBar.tsx       ← 모바일 하단 탭
src/components/trpg/game/MobileSheet.tsx        ← 모바일 bottom sheet
supabase/migrations/016_portrait_urls.sql
```

### 크게 수정
```
src/app/globals.css                            ← CSS 변수 시스템 추가
src/app/trpg/game/[sessionId]/page.tsx         ← 레이아웃 전면 재설계
src/components/trpg/game/ChatLog.tsx           ← 말풍선 스타일
src/components/trpg/game/ActionPanel.tsx       ← 카드 UI
src/components/trpg/game/DiceRollOverlay.tsx   ← 드라마 연출
src/components/trpg/game/NpcEmotionPanel.tsx   ← 초상화 카드
src/components/trpg/game/TurnIndicator.tsx     ← pulse 애니메이션
```

### 작게 수정
```
src/components/trpg/game/QuestTrackerPanel.tsx
src/components/trpg/game/LoreDiscoveryPanel.tsx
src/components/trpg/game/CharacterStatus.tsx
src/components/trpg/game/PlayerList.tsx
```

---

## 10. 주의사항

**Vertex AI 인증 방식 (Vercel 배포 시)**
Vercel은 파일 시스템에 서비스 계정 JSON을 저장할 수 없습니다.
→ JSON 키를 base64로 인코딩해서 환경변수로 저장, 런타임에 파싱합니다:

```typescript
// src/lib/ai/vertex-imagen.ts
const credentials = JSON.parse(
  Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64!, "base64").toString()
);
```

**초상화 생성 실패 시**
Vertex AI 호출이 실패해도 게임 진행에 영향 없어야 합니다.
→ 항상 DiceBear fallback이 먼저 표시되고, 성공 시에만 교체됩니다.

**모바일 bottom sheet 접근성**
드래그로 닫기 + 배경 클릭으로 닫기 둘 다 지원해야 합니다.
