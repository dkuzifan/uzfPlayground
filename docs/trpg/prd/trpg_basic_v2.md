# 📜 상세 제품 요구사항 명세서 v2 (PRD): 웹 기반 다중 에이전트 TRPG 플랫폼

> **v2 업데이트:** 2026-03-09
> **원본 문서:** `docs/trpg_basic.md` (초기 기획안, 2026-03 초)
> **변경 배경:** P1~P7 구현 완료 후 실제 아키텍처와 달라진 사항을 반영.
> **기술 상세:** 구현 세부 내용은 `docs/system-overview.md` 참조.

---

## 1. 프로젝트 개요 및 비전

- **목표:** 1~7인의 플레이어가 단일 웹 페이지에 동시 접속하여, 생성형 AI(Gemini API)가 구동하는 게임 마스터(GM) 및 NPC들과 실시간으로 상호작용하는 턴제 텍스트 TRPG 플랫폼 개발.
- **코어 밸류:** 발더스 게이트 3 스타일의 '개인화된 동적 선택지'를 통해 TRPG의 진입 장벽을 낮추면서도, '직접 입력'을 통한 무한한 자유도를 동시에 제공.
- **초기 테마:** 정통 하이 판타지. 이후 미스터리, 호러, SF 등으로 확장 가능한 범용적 엔진 구축.

---

## 2. 핵심 게임플레이 시스템

### 하이브리드 행동 선언 시스템

플레이어는 게임 입장 전 **MBTI + 에니어그램 + D&D 성향** 3가지 성향 테스트를 거쳐 `PersonalityProfile`을 확정합니다.

플레이어 턴 도래 시, 시스템은 **3가지 성향 지표를 모두 활용**한 맞춤형 선택지 3개를 자동 생성합니다.

> **v1 → v2 변경:** 초기에는 `avatar:N` 인덱스 기반 8가지 유형으로 단순화했으나, v2에서 MBTI 16종 + 에니어그램 9종 + D&D 9성향을 개별 텍스트로 변환하여 Gemini에 주입하도록 개선.

자유도 보존을 위해 1개의 자유 입력(Text Input) 영역을 상시 노출합니다.

### 판정 및 턴 제어 로직

> **v1 → v2 변경 (핵심):** 초기 설계에서는 "AI GM이 상황 맥락과 스탯을 바탕으로 판정"했으나, AI 할루시네이션으로 인한 불공정/비일관성 문제가 발견되어 **결정론적 서버 판정 시스템**으로 전면 변경.

**현행 판정 구조:**

```
Phase 1: Gemini → 행동 분류(ActionCategory)만 반환
          서버 → NPC resistance_stats로 DC 계산 (AI 개입 없음)

Phase 2: 클라이언트 → d20 애니메이션 후 rolled 값 전송
          서버 → DC 재검증 + [크리티컬/성공/부분성공/실패] 확정
          Gemini → 확정된 결과를 서술로만 표현
```

- 판정 난이도(DC)는 NPC의 `resistance_stats`(물리방어, 정신의지, 지각) 수치에서 서버가 직접 계산.
- AI는 절대 DC를 결정하지 않으며, "어떤 종류의 행동인지"만 분류합니다.
- 서버 사이드 라운드 로빈(Round-Robin) 턴 강제 및 30초 타임아웃 자동 처리.

---

## 3. AI 및 멀티 에이전트 아키텍처

### 역할별 에이전트 분리 원칙

| 에이전트 | 역할 | AI 판단 범위 |
|---------|------|-------------|
| **System GM** | GM 서사 서술, HP 변화 계산 | 서술 내용, 행동 분류(ActionCategory) |
| **NPC 에이전트** | 극 중 NPC 발화 | 대사, 비언어적 지문 |
| **메모리 에이전트** | 배경에서 기억 요약 | 주관적 기억 왜곡, 감정 태그 |

> **v1 → v2 변경:** 메모리 에이전트가 신설됨. GM과 NPC 에이전트의 역할도 더 명확히 분리됨.

### NPC 다이내믹 페르소나 시스템 (신설)

v2에서 NPC는 단순한 캐릭터 프로필을 넘어 **3겹의 레이어**를 가집니다.

**레이어 1 — 정적 정체성 (DB에 고정)**
- MBTI, 에니어그램, D&D 성향, 외형, 성격, 숨겨진 동기
- 저항 스탯: `physical_defense`, `mental_willpower`, `perception`
- 언어 프로필: 말투, 어미, 금지어, 회피 스타일
- 취향 목록: 트리거 키워드 + 감정 모디파이어 배열

**레이어 2 — 동적 심리 상태 (매 턴 변화)**
- 17개 실시간 변수: 스트레스, 공포, 호감도, 신뢰도, 권력 우위 등
- `fear_survival ≥ 80` → 공포 셧다운: 모든 변수를 무시하고 도망/항복

**레이어 3 — 주관적 기억 (5턴마다 누적)**
- 객관적 채팅 로그 → NPC 편향 필터 통과 → 왜곡된 기억으로 저장
- 에빙하우스 지수 감쇠로 기억이 흐려짐 (NPC 성격마다 망각 속도 다름)
- `is_core_memory: true`인 기억은 절대 잊히지 않음

### 취향 모디파이어 엔진 (신설)

플레이어 텍스트에서 NPC 취향 키워드가 감지되면, 감정 변화량의 **부호와 배율**이 변경됩니다.

> 예: "거친 대우"를 즐기는 NPC에게 플레이어가 명령하면 → 일반적으로는 `affinity -10`이지만, 취향 매칭 시 `affinity +15`로 역전.

이 왜곡은 기억 저장 시에도 동일하게 반영되어 NPC 내러티브의 일관성을 유지합니다.

### 서사적 무결성 (미스터리 장르 대응)

핵심 진실은 세션 시작 시 `Scenario.fixed_truths`에 하드코딩되어 GM 에이전트에 주입됩니다. AI 환각에 의한 설정 붕괴를 차단합니다.

---

## 4. 시스템 구조 및 데이터베이스 설계

### 실시간 통신

Supabase Realtime을 통해 `Action_Log` INSERT와 `Game_Session` UPDATE를 모든 참여자에게 실시간으로 브로드캐스트합니다.

### 데이터베이스 스키마 (v2 기준: 8개 테이블)

> **v1 → v2 변경:** 초기 6개 테이블에서 `World_Dictionary` 추가 및 기존 테이블에 대규모 컬럼 확장.

| 테이블 | 핵심 역할 | v2 주요 변경 |
|--------|-----------|-------------|
| `Scenario` | 세계관/퀘스트 마스터 데이터 | — |
| `NPC_Persona` | NPC 메타데이터 | **v2:** `resistance_stats`, `species_info`, `linguistic_profile`, `taste_preferences`, `decay_rate_negative`, `knowledge_level` 추가 |
| `Game_Session` | 방 단위 게임 상태 | **v2:** `npc_dynamic_states`, `pending_lore_queue`, `session_environment`, `quest_tracker` 추가 |
| `Player_Character` | 유저 캐릭터 정보 | **v2:** `personality`(PersonalityProfile), `species_info`, `base_modifiers`, `equipped_items`, `status_effects` 추가 |
| `Action_Log` | 채팅 및 행동 로그 | — |
| `Session_Memory` | 토큰 관리 + NPC 기억 | **v2:** `npc_id`, `emotional_tags`, `is_core_memory`, `created_at_turn`, `decayed_emotion_level` 추가. NPC별 다수 기억 지원. |
| `World_Dictionary` | 세계관/개인사 지식 사전 | **신설 (v2)** |

### World_Dictionary (신설)

세계관 정보를 키워드 기반으로 동적 호출하는 테이블입니다.

| 컬럼 | 설명 |
|------|------|
| `domain` | `WORLD_LORE` (세계관 공통) / `PERSONAL_LORE` (NPC 개인사) |
| `trigger_keywords` | 유저 텍스트에서 매칭할 키워드 배열 |
| `cluster_tags` | 태그 군집화용 의미망 태그 |
| `lore_text` | AI에게 주입될 설정 텍스트 (150자 이내 권장) |
| `importance_weight` | 우선순위 (1~10) |
| `required_access_level` | 최소 접근 레벨 (WORLD_LORE: NPC 지식 레벨, PERSONAL_LORE: 신뢰도 기반) |

### Lore Queue 시스템 (신설)

플레이어가 여러 세계관 키워드를 동시에 언급할 때:

1. 권한 없는 정보 → 영구 탈락 (AI가 모른다고 자연스럽게 대답)
2. 연관 태그 있는 항목끼리 군집화
3. 토큰 한도(300자) 내 최우선 그룹만 이번 턴 설명
4. 나머지 → `Game_Session.pending_lore_queue`에 키워드 이름만 저장
5. NPC가 자신의 성격(`evasion_style`)에 맞게 서사적으로 회피

### API 통신 구조

```
클라이언트 → POST /api/trpg/game/action
              {session_id, player_id, action_type, content}

서버 응답 (주사위 필요 시):
              {needs_dice_check: true, dc, check_label, action_category}

클라이언트 → POST /api/trpg/game/action/resolve
              {session_id, player_id, action_content, dc, rolled, action_category}

서버 응답:    {rolled, modifier, total, dc, outcome}
              → Supabase Realtime으로 Action_Log 브로드캐스트
```

---

## 5. 개발 마일스톤 현황

### ✅ Phase 0 — 프로젝트 뼈대 (완료)

- Next.js 16 + Supabase + Gemini API 환경 세팅
- 초기 DB 스키마 6개 테이블 적용
- GitHub 연결

### ✅ Phase 1 — 세션/로비 API (완료)

- 방 생성, 입장, 나가기, 저장, 삭제 API
- Supabase RLS 정책 적용

### ✅ Phase 2 — AI 에이전트 파이프라인 (완료)

- 2-Phase 주사위 판정 시스템 (결정론적 DC)
- NPC 다이내믹 페르소나 (17개 심리 변수)
- 취향 모디파이어 엔진
- 성향 기반 선택지 생성 (MBTI/에니어그램/D&D)
- Lore Queue 시스템 + World_Dictionary
- DB 스키마 v2/v3 마이그레이션

### ✅ Phase 3 — 메모리 최적화 (완료)

- NPC 주관적 기억 요약 에이전트
- 에빙하우스 지수 감쇠 망각 공식
- 5턴마다 자동 실행 파이프라인

### 🔲 Phase 4 — 프론트엔드 UI/UX (진행 예정)

- 게임 진행 화면 완성 (ChatLog, ActionPanel 등)
- 캐릭터 상태창 (HP 게이지, 감정 수치 시각화)
- 주사위 애니메이션 개선
- 온보딩 성향 테스트 UI 완성

---

## 6. 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16.1.6 (App Router, Turbopack) |
| 언어 | TypeScript |
| 스타일 | Tailwind CSS v4 |
| DB / 실시간 | Supabase (PostgreSQL + Realtime) |
| AI | Google Gemini API (`@google/generative-ai`) |
| 인증 | Supabase SSR (`@supabase/ssr`) + 공용 PIN |
| 배포 | Vercel |
