# 온보딩 흐름 재설계 기획서

> 작성일: 2026-03-10
> 배경: 기존 게스트 프로필(닉네임/아바타) + 캐릭터 생성의 이중화 문제 해결,
>       시나리오 선택 스텝 추가, 시나리오별 캐릭터 생성 UI 도입

---

## 1. 현재 흐름 (문제점)

```
로비 진입
  └→ GuestProfileModal (닉네임/아바타 설정) ← 캐릭터 생성과 중복
       └→ 로비 (방 목록)
            └→ 방 만들기 → 시나리오 자동 고정 (fantasy) ← 선택 불가
            └→ 캐릭터 만들기 배너 → /trpg/character/create ← 방과 무관하게 존재
```

**문제**
1. 닉네임/아바타와 캐릭터 이름/직업이 별도 단계로 분리 → 같은 정보를 두 번 수집
2. 시나리오 선택 없음 — 항상 판타지 고정
3. 캐릭터 생성이 방 참여 흐름과 분리 — 캐릭터 없이도 방 입장 가능

---

## 2. 목표 흐름 (재설계)

```
로비 진입
  └→ localId 없으면 자동 생성 (닉네임은 캐릭터 생성 시 수집, 별도 모달 없음)
       └→ 로비 (방 목록 + 방 만들기)
            ├─ 방 만들기
            │    └→ 시나리오 선택 (DB 목록 + 새 시나리오 추가)
            │         └→ 시나리오에 맞는 캐릭터 생성
            │              └→ 방 생성 + 대기실
            └─ 기존 방 참여 (방 카드 클릭)
                 ├─ 이미 그 방 캐릭터 있음 (DB 확인) → 바로 대기실
                 └─ 처음 참여 → 시나리오에 맞는 캐릭터 생성 → 대기실
```

**이탈 후 재입장**
- `Player_Character`가 DB에 남아있어 `localId`로 본인 캐릭터 식별
- 재입장 시 기존 캐릭터 그대로 복원, 새 캐릭터 생성 불필요

---

## 3. 제거 / 추가 / 변경 항목

### 제거
| 항목 | 이유 |
|---|---|
| `GuestProfileModal` | 닉네임/아바타를 캐릭터 생성에서 수집하므로 불필요 |
| `/trpg/character/create` 페이지 | 방 참여 흐름에 통합, 독립 페이지 불필요 |
| 로비의 "캐릭터 미생성 배너" | 온보딩 흐름 자체가 캐릭터 생성을 강제하므로 불필요 |
| `GuestProfile.characterCreated` 플래그 | 위와 동일 |

### 추가
| 항목 | 설명 |
|---|---|
| 시나리오 선택 UI | 방 만들기 첫 단계. DB Scenario 목록 표시 + 새 시나리오 추가 |
| 시나리오별 캐릭터 생성 UI | 선택한 시나리오의 `character_creation_config` 기반으로 렌더링 |
| 방 참여 시 기존 PC 체크 | join 전에 `(session_id, user_id)` 조회 → 있으면 스킵 |
| GET `/api/trpg/scenarios` | 활성 시나리오 목록 반환 |
| DB: `Scenario.character_creation_config` | 시나리오별 직업 목록, 캐릭터 생성 UI 설정 |

### 변경
| 항목 | 변경 내용 |
|---|---|
| `CreateRoomModal` | 시나리오 선택 → 캐릭터 생성 → 방 생성 3단계 흐름으로 확장 |
| `sessions POST` | `scenario_id`를 클라이언트가 전달 (자동 fantasy 고정 제거) |
| `WaitingRoom 대기실 page.tsx` | 참여 전 기존 PC 여부 API 확인 후 캐릭터 생성 여부 결정 |
| `GuestProfile` 타입 | `characterCreated`, `characterName`, `job`, `personality` 제거 또는 세션별로 관리 |
| `useGuestProfile` | localId/nickname만 유지. 캐릭터 정보는 세션별 별도 관리 |

---

## 4. DB 스키마 변경

### 4.1 Scenario 테이블에 `character_creation_config` 추가

```sql
ALTER TABLE "Scenario"
  ADD COLUMN IF NOT EXISTS character_creation_config JSONB NOT NULL DEFAULT '{
    "available_jobs": ["warrior", "mage", "rogue", "cleric", "ranger", "paladin", "bard"],
    "job_labels": {
      "warrior": "전사",
      "mage": "마법사",
      "rogue": "도적",
      "cleric": "성직자",
      "ranger": "레인저",
      "paladin": "성기사",
      "bard": "음유시인"
    },
    "personality_test_theme": "fantasy",
    "character_name_hint": "캐릭터 이름을 입력하세요"
  }';
```

**`personality_test_theme`** — 성향 테스트 씬의 배경 테마
- `"fantasy"`: 마법/검의 세계관 배경 (현재 12씬)
- `"modern"`: 현대 배경 씬 (추후 구현)
- `"mystery"`: 밀실/탐정 배경 씬 (추후 구현)

**판타지 예시**
```json
{
  "available_jobs": ["warrior", "mage", "rogue", "cleric", "ranger", "paladin", "bard"],
  "job_labels": { "warrior": "전사", "mage": "마법사", ... },
  "personality_test_theme": "fantasy",
  "character_name_hint": "모험가의 이름을 입력하세요"
}
```

**머더 미스터리 예시**
```json
{
  "available_jobs": ["detective", "journalist", "doctor", "lawyer", "civilian"],
  "job_labels": { "detective": "형사", "journalist": "기자", ... },
  "personality_test_theme": "modern",
  "character_name_hint": "실명 또는 가명을 입력하세요"
}
```

### 4.2 migration 파일
- `005_scenario_character_config.sql` 신규 작성

---

## 5. API 변경

### 5.1 GET `/api/trpg/scenarios` (신규)
활성 시나리오 목록 반환

**Response**
```json
[
  {
    "id": "uuid",
    "title": "어둠의 던전",
    "theme": "fantasy",
    "description": "마법과 검이 교차하는 세계...",
    "max_players": 6,
    "character_creation_config": { ... }
  }
]
```

### 5.2 POST `/api/trpg/scenarios` (신규)
새 시나리오 저장 (시나리오 제작자가 완성 후 저장)

**Request Body**
```json
{
  "title": "시나리오 이름",
  "theme": "fantasy | mystery | horror | sci-fi",
  "description": "시나리오 설명",
  "max_players": 4,
  "gm_system_prompt": "GM 지시어 (AI 초안 또는 직접 작성)",
  "character_creation_config": { ... }
}
```

### 5.3 POST `/api/trpg/scenarios/generate-prompt` (신규)
AI GM 프롬프트 초안 생성

**Request Body**
```json
{
  "title": "우주 탈출",
  "theme": "sci-fi",
  "description": "산소가 부족한 우주선에서 생존을 위해 협력하는 이야기"
}
```
**Response**
```json
{
  "gm_system_prompt": "당신은 2187년 목성 궤도를 항행 중인..."
}
```

### 5.3 POST `/api/trpg/sessions` 변경
- `scenario_id`를 클라이언트에서 전달받도록 변경 (fantasy 자동 고정 제거)

### 5.4 GET `/api/trpg/sessions/[sessionId]/my-character` (신규)
방 참여 전 기존 PC 여부 확인

**Query**: `?localId=xxx`
**Response**: `{ exists: true, character: { ... } }` 또는 `{ exists: false }`

---

## 6. 컴포넌트 / 페이지 변경

### 6.1 `CreateRoomModal` → 4단계 흐름으로 확장

```
Step 1: 시나리오 선택
  - DB에서 시나리오 목록 로드
  - 카드 형태로 표시 (제목, 테마, 설명)
  - "+ 새 시나리오 만들기" 카드 포함
       └→ [새 시나리오 만들기 진입 시]
            Step 1-A: 기본 정보 입력 (제목, 테마, 설명, 최대 인원)
            Step 1-B: 직업 설정 (available_jobs, job_labels)
            Step 1-C: GM 프롬프트 작성
                       - "AI로 초안 생성" 버튼 → Gemini가 제목/테마/설명 기반으로 생성
                       - 생성된 초안을 텍스트에리어에서 직접 수정 가능
                       → 저장 후 Step 1로 복귀, 방금 만든 시나리오 자동 선택

Step 2: 캐릭터 생성 (선택한 시나리오 config 기반)
  - 캐릭터 이름 + 아바타 선택 (닉네임 대체)
  - 직업 선택 (시나리오별 available_jobs)
  - 성향 테스트 (personality_test_theme 기반)

Step 3: 방 이름 / 최대 인원 설정
  → 완료 시 POST /api/trpg/sessions
```

### 6.2 `RoomCard` 클릭 시 흐름 변경

```
기존 방 카드 클릭
  → GET /api/trpg/sessions/[sessionId]/my-character?localId=xxx
      ├─ exists: true  → /trpg/lobby/[roomId] (바로 대기실)
      └─ exists: false → 캐릭터 생성 모달 (시나리오 config 로드)
                              → POST /api/trpg/sessions/[sessionId]/join
                                   → /trpg/lobby/[roomId]
```

### 6.3 `GuestProfile` 타입 슬림화

```typescript
// 변경 후
interface GuestProfile {
  localId: string;   // 사용자 고유 식별자 (유지)
  nickname: string;  // 최근 사용한 캐릭터 이름 (자동 갱신)
  avatarIndex: number; // 최근 사용한 아바타 (자동 갱신)
}
// 제거: characterCreated, characterName, job, personality
```

캐릭터 정보는 localStorage가 아닌 DB(`Player_Character`)에만 저장.

### 6.4 `/trpg/character/create` 페이지
- 방 참여 흐름에 통합되므로 **삭제** 또는 리다이렉트 처리

---

## 7. 구현 단계 (Phase)

| Phase | 내용 | 범위 |
|---|---|---|
| **Phase A** | DB 스키마 추가 (`character_creation_config`) + migration | 소 |
| **Phase B** | GET `/api/trpg/scenarios`, 시나리오 목록 UI | 중 |
| **Phase C** | 시나리오 제작 UI (Step 1-A~C) + AI 프롬프트 생성 API | 중 |
| **Phase D** | `CreateRoomModal` 4단계 흐름 (시나리오→캐릭터→방설정) | 대 |
| **Phase E** | 방 참여 시 기존 PC 체크 + 캐릭터 생성 모달 | 중 |
| **Phase F** | GuestProfile 슬림화, 기존 파일 정리 | 소 |

---

## 8. 미결 사항

| 항목 | 내용 |
|---|---|
| 시나리오별 성향 테스트 씬 | `personality_test_theme: "modern"` 등 추가 테마의 12씬 작성 필요. Phase D에서는 "fantasy" 테마만 구현하고 나머지는 추후 |
| 시나리오 제작 권한 | 현재는 누구나 새 시나리오 제작 가능. 추후 인증 기반 제한 고려 |
