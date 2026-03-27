---
title: AI 채팅 - Tech Spec
date: 2026-03-27
prd: docs/prd/260327-ai-chat.md
status: draft
---

## 의존성 분석 및 기술 설계

### API
- 신규 라우트 그룹 `src/app/api/chat/` 생성 (기존 `/api/trpg/` 완전 독립)
- `GET/POST /api/chat/characters` — 캐릭터 목록 조회 / 생성
- `PATCH/DELETE /api/chat/characters/[characterId]` — 캐릭터 수정 / 삭제
- `GET/POST/DELETE /api/chat/[characterId]/messages` — 히스토리 조회 / 메시지 전송 / 대화 초기화

### DB
- **신규 테이블 2개** (마이그레이션 필요)
  - `AI_Character`: 캐릭터 정의 (소유자 localId, 이름, 성격, 공개 여부 등)
  - `AI_Chat_Message`: 대화 메시지 (캐릭터 ID, 사용자 localId, role, content, emotion_state)
- 기존 테이블 변경 없음

### Domain
- 신규 `src/lib/chat/` 디렉토리
  - `chat-agent.ts` — Gemini 2.0 Flash 호출, 구조화된 응답(reply + emotion_state) 반환
  - `types.ts` — AiCharacter, ChatMessage 타입 정의
- TRPG 파이프라인(`memory-pipeline`, `lore-engine` 등) 의존 없음

### UI
- 신규 페이지: `src/app/tales/chat/page.tsx` (캐릭터 목록)
- 신규 페이지: `src/app/tales/chat/[characterId]/page.tsx` (대화 화면)
- 신규 컴포넌트 디렉토리: `src/components/chat/`
  - `CharacterCard.tsx`, `CharacterForm.tsx`, `ChatScreen.tsx`, `PresenceHeader.tsx`
- `/tales/chat` 항목을 `src/app/tales/page.tsx`에서 `soon` 제거

### Release Strategy
- DB 마이그레이션 → API → 도메인 로직 → UI 순으로 구현
- `/tales/chat`는 마이그레이션 완료 후 `soon: false` 전환

---

## Plan (Implementation Checklist)

**Step 1: DB 스키마** ← 마이그레이션 후 진행 가능
- [ ] `supabase/migrations/017_ai_chat.sql` 작성
  - `AI_Character` 테이블 + 인덱스
  - `AI_Chat_Message` 테이블 + `(character_id, local_id, created_at DESC)` 인덱스
  - `AI_Chat_Message.character_id` → `AI_Character.id` ON DELETE CASCADE FK
- [ ] Supabase 대시보드에서 SQL 실행 및 적용 확인

**Step 2: 도메인 로직** ← Step 1 완료 후
- [ ] `src/lib/chat/types.ts`
  - `AiCharacter`, `ChatMessage`, `EmotionState` 타입
  - mood 유니온: `"happy" | "neutral" | "sad" | "angry" | "surprised"`
- [ ] `src/lib/chat/chat-agent.ts`
  - `getGeminiModel("gemini-2.0-flash")` 사용
  - 시스템 프롬프트 조립 (personality + creator_bio 조건부 주입)
  - JSON 응답 파싱, 실패 시 `{ reply: rawText, mood: "neutral", intensity: 30 }` fallback

**Step 3: API 라우트** ← Step 2 완료 후
- [ ] `src/app/api/chat/characters/route.ts`
  - `GET`: mine(local_id 일치) + public 목록 반환 — public 응답에서 `personality` 제외
  - `POST`: 생성, local_id·name·personality 필수 검증
- [ ] `src/app/api/chat/characters/[characterId]/route.ts`
  - `PATCH`: local_id 소유 검증 후 수정
  - `DELETE`: local_id 소유 검증 후 삭제 (메시지 cascade)
- [ ] `src/app/api/chat/[characterId]/messages/route.ts`
  - `GET`: `?local_id=` 쿼리, 최대 100건 created_at ASC, `inner_monologue` 제외
  - `POST`: 유저 메시지 저장 → 컨텍스트 20건 조회 → chat-agent 호출 → AI 메시지 저장 → 응답 반환 (`inner_monologue` 제외)
  - `DELETE`: local_id 소유 검증 후 해당 대화 전체 삭제

**Step 4: 훅 및 컴포넌트** ← Step 3 완료 후
- [ ] `src/hooks/chat/useChat.ts`
  - 상태: `messages`, `isLoading`, `emotionState`
  - 액션: `sendMessage(content)`, `loadHistory()`, `clearMessages()`
  - 낙관적 업데이트: 전송 즉시 user 메시지 목록에 추가
- [ ] `src/components/chat/PresenceHeader.tsx`
  - Props: `name`, `initial`, `mood`, `vibe`
  - mood에 따른 배경 그라디언트 + 아바타 ring 색상 전환 (CSS transition)
- [ ] `src/components/chat/CharacterCard.tsx`
  - Props: `character`, `onClick`
  - 공개/비공개 배지, 이니셜 아바타
- [ ] `src/components/chat/CharacterForm.tsx`
  - 생성/편집 모드 공용
  - 필수 필드 인라인 유효성 검사
- [ ] `src/components/chat/ChatScreen.tsx`
  - `useChat` 훅 사용
  - 친밀형 레이아웃 (PresenceHeader 상단 고정 + 스크롤 메시지 + 입력창)
  - Enter 전송, Shift+Enter 줄바꿈

**Step 5: 페이지 연결** ← Step 4 완료 후
- [ ] `src/app/tales/chat/page.tsx`
  - localId 읽기 (localStorage)
  - 캐릭터 0개: 빈 상태 + 생성 버튼
  - 캐릭터 있음: 내 캐릭터 / 공개 캐릭터 섹션
  - 생성 폼: 인라인 슬라이드업 or 별도 `/tales/chat/new` 페이지 (구현 시 결정)
- [ ] `src/app/tales/chat/[characterId]/page.tsx`
  - params에서 characterId 추출, ChatScreen 렌더링
- [ ] `src/app/tales/page.tsx` — AI 채팅 `soon: true` 제거

---

## 테스트 계획

- **1. Regression**
  - [ ] `/tales/trpg` 기존 TRPG 플로우 정상 동작 확인
  - [ ] `/tales` 목록 화면에 AI 채팅 카드 노출 확인

- **2. 신규 피처 플로우**
  - [ ] 빈 상태 → 캐릭터 생성 → 대화 시작 전체 흐름
  - [ ] 메시지 전송 후 DB에 저장되는지 확인
  - [ ] 브라우저 새로고침 후 히스토리 복원 확인
  - [ ] 대화 초기화 후 메시지 전체 삭제 확인
  - [ ] 공개 캐릭터가 다른 localId에서 보이는지 확인
  - [ ] 감정 상태 UI 변화 확인 (inner_monologue 미노출)

---

## 데이터 흐름 및 테이블 명세

### AI_Character

```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
local_id      text NOT NULL              -- 소유자 (localStorage UUID)
name          text NOT NULL
bio           text                       -- 한 줄 소개 (목록 표시용)
personality   text NOT NULL             -- 성격 설명 (시스템 프롬프트로 사용)
creator_bio   text                       -- 제작자 정보 (공개 시 AI가 답변에 활용)
is_public     boolean NOT NULL DEFAULT false
created_at    timestamptz DEFAULT now()
```

### AI_Chat_Message

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
character_id    uuid NOT NULL REFERENCES AI_Character(id) ON DELETE CASCADE
local_id        text NOT NULL              -- 대화 주체 (소유자와 다를 수 있음 — 공개 캐릭터)
role            text NOT NULL CHECK (role IN ('user','assistant'))
content         text NOT NULL
inner_monologue text                       -- AI 내면 독백, UI 완전 미노출
emotion_state   jsonb                      -- { mood, intensity } — UI 노출
created_at      timestamptz DEFAULT now()
```

> **인덱스**: `(character_id, local_id, created_at DESC)` — 히스토리 조회 최적화

---

### 흐름 1: 캐릭터 목록 로드

```
GET /api/chat/characters?local_id=xxx
  └─ AI_Character SELECT WHERE local_id = xxx              [Read] → mine
  └─ AI_Character SELECT WHERE is_public = true
       AND local_id != xxx                                  [Read] → public (personality 제외)
  └─ Response: { mine: [...], public: [...] }
```

### 흐름 2: 캐릭터 생성

```
POST /api/chat/characters
  └─ 유효성 검사: name, personality 필수
  └─ AI_Character INSERT                                    [Write]
  └─ Response: AiCharacter (personality 포함 — 본인이므로)
  └─ 클라이언트: 생성 완료 → /tales/chat/[characterId] 이동
```

### 흐름 3: 메시지 전송

```
POST /api/chat/[characterId]/messages
  └─ AI_Character SELECT id, personality, creator_bio      [Read] → 없으면 404
  └─ AI_Chat_Message INSERT (role: user, content)          [Write]
  └─ AI_Chat_Message SELECT 최근 20건 (created_at DESC)    [Read] → 컨텍스트
  └─ chat-agent.ts → Gemini 2.0 Flash 호출
       ├─ 성공: { reply, mood, intensity, inner_monologue }
       └─ 실패: fallback { reply: "(응답 없음)", mood: "neutral", intensity: 0 }
  └─ AI_Chat_Message INSERT (role: assistant,              [Write]
       content: reply,
       emotion_state: {mood, intensity},
       inner_monologue: inner_monologue)
  └─ Response: { id, reply, emotion_state: {mood, intensity}, created_at }
       ※ inner_monologue 미포함
```

### 흐름 4: 히스토리 복원

```
GET /api/chat/[characterId]/messages?local_id=xxx
  └─ AI_Chat_Message SELECT
       WHERE character_id = ? AND local_id = ?
       ORDER BY created_at ASC LIMIT 100                   [Read]
  └─ Response: { messages: [{id, role, content, emotion_state, created_at}] }
       ※ inner_monologue 필드 SELECT에서 제외
```

### 흐름 5: 대화 초기화

```
DELETE /api/chat/[characterId]/messages
  └─ AI_Character SELECT local_id WHERE id = ?             [Read] → 소유 검증
       ※ 공개 캐릭터의 경우 자신의 대화만 삭제 가능 (character_id + local_id 조건)
  └─ AI_Chat_Message DELETE
       WHERE character_id = ? AND local_id = ?             [Write]
  └─ Response: { deleted: N }
```

---

## API 명세

### POST `/api/chat/[characterId]/messages`
- **Description**: 메시지 전송 + AI 응답 반환
- **Request Body**: `{ local_id: string, content: string }`
- **Response**: `{ id: string, reply: string, emotion_state: { mood: string, intensity: number }, created_at: string }`
- **Error**: 404 캐릭터 없음, 400 content 빈값

### GET `/api/chat/[characterId]/messages`
- **Description**: 히스토리 조회 (최대 100건, created_at ASC)
- **Query**: `?local_id=xxx`
- **Response**: `{ messages: Array<{ id, role, content, emotion_state, created_at }> }`
  - ※ `inner_monologue` 필드는 응답에서 제외

### DELETE `/api/chat/[characterId]/messages`
- **Description**: 특정 localId의 대화 전체 삭제
- **Request Body**: `{ local_id: string }`
- **Response**: `{ deleted: number }`

### GET `/api/chat/characters`
- **Description**: 내 캐릭터 + 공개 캐릭터 목록
- **Query**: `?local_id=xxx`
- **Response**: `{ mine: AiCharacter[], public: AiCharacter[] }`
  - ※ 공개 캐릭터 응답에서 `personality` 필드 제외

### POST `/api/chat/characters`
- **Request Body**: `{ local_id, name, bio?, personality, creator_bio?, is_public? }`
- **Response**: `AiCharacter`

---

## Gemini 프롬프트 구조 (`chat-agent.ts`)

```
System:
  당신은 [name]입니다.
  [personality]
  [creator_bio가 있을 경우]: 당신을 만든 사람에 대한 정보: [creator_bio]

  응답은 반드시 아래 JSON 형식으로만 반환하세요:
  {"reply": "...", "mood": "happy|neutral|sad|angry|surprised", "intensity": 0-100, "inner_monologue": "..."}

  규칙:
  - reply: 캐릭터 말투와 성격을 반영한 자연스러운 답변
  - mood: 이 답변을 할 때의 감정
  - intensity: 감정의 강도 (0=거의 없음, 100=매우 강함)
  - inner_monologue: 겉으로 드러내지 않는 속마음 (절대 reply에 포함 금지)

User/Assistant turns: [최근 20건 히스토리]
User: [현재 메시지]
```

---

## Risk & Rollback

| 리스크 | 발생 조건 | 대응 |
|--------|-----------|------|
| Gemini JSON 파싱 실패 | 응답 포맷 불일치 | try/catch → reply 텍스트만 저장, mood=neutral fallback |
| localId 스푸핑 | 악의적 요청으로 타인 캐릭터 삭제 | DELETE/PATCH 시 local_id + character_id 소유 검증 |
| 공개 캐릭터 personality 노출 | GET /characters 응답 누락 필터 | SELECT 쿼리에서 personality 컬럼 명시 제외 |
| 메시지 무제한 축적 | 대화 100건 초과 | MVP에서는 허용, 추후 오래된 메시지 정리 배치 추가 |

- **롤백**: DB 마이그레이션은 `DOWN` SQL 포함, `/tales/page.tsx`에서 `soon: true` 재활성화로 즉시 숨김 처리 가능
- **관찰 포인트**: Gemini 응답 실패율, 메시지 저장 지연
