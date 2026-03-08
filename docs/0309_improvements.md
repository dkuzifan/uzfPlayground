# 개선 검토 리포트 (2026-03-09)

> Phase 0~4 구현 완료 후 코드베이스 전체 검토 결과.
> 리스키한 항목, 불완전한 항목, 발전 방향을 정리함.

---

## 🔴 리스키한 것들 (실제 문제 가능)

### 1. 클라이언트가 주사위 값을 조작할 수 있음
- **현황**: `DiceRollOverlay`가 d20을 클라이언트에서 굴리고 서버로 전송. DC는 서버 재검증하지만 `rolled` 값 자체는 신뢰함.
- **위험**: 악의적 사용자가 `rolled: 20`을 항상 보내면 크리티컬 성공 남발 가능.
- **해결 방향**: `resolve` API에서 서버가 직접 d20을 굴리고, 클라이언트에는 결과만 반환. 클라이언트의 애니메이션은 서버 결과값으로 재생.
- **관련 파일**: `src/app/api/trpg/game/action/resolve/route.ts`, `src/components/trpg/game/DiceRollOverlay.tsx`

### 2. join API에서 `personality` 무검증 수신
- **현황**: `join/route.ts`가 클라이언트 body의 `personality` 객체를 검증 없이 DB에 저장.
- **위험**: 임의 데이터 주입 가능. 예: `mbti: "HACK"`, 스크립트 삽입 시도.
- **해결 방향**: 허용 MBTI 타입 16종 / 에니어그램 1~9 / D&D 9성향 목록으로 서버 측 화이트리스트 검증 추가.
- **관련 파일**: `src/app/api/trpg/sessions/[sessionId]/join/route.ts`

### 3. NPC_Persona를 브라우저 클라이언트로 직접 조회
- **현황**: `useGameScreen`에서 `createClient()`(브라우저)로 `NPC_Persona` 조회.
- **위험 1**: RLS가 public read를 막으면 NPC 감정 패널이 빈 배열로 렌더링됨 (무음 실패).
- **위험 2**: RLS가 public read를 허용하면 `hidden_motivation`, `system_prompt` 등 숨겨진 시나리오 정보가 클라이언트에 노출됨.
- **해결 방향**: 서버 API(`/api/trpg/game/session/[sessionId]`)에서 NPC 공개 정보만 선택적으로 반환하도록 수정. `hidden_motivation`, `system_prompt`는 서버에서 제외.
- **관련 파일**: `src/hooks/useGameScreen.ts`

---

## 🟡 불완전한 것들 (동작하지만 한계 있음)

### 4. 멀티 NPC 미지원
- **현황**: 모든 API에서 `primaryNpc = npcs[0]`만 사용. NPC가 2명 이상인 시나리오 불가.
- **영향**: 심리 상태 업데이트, 대화 생성, Lore 추출 모두 첫 번째 NPC에만 적용.
- **해결 방향**: 행동 내용(`action_content`)과 NPC 역할(`role`)을 매칭하거나, 씬에 등장한 NPC 목록을 관리하는 `active_npc_ids` 필드를 `Game_Session`에 추가.
- **관련 파일**: `src/app/api/trpg/game/action/route.ts`, `resolve/route.ts`

### 5. 캐릭터 생성 우회 가능
- **현황**: 로비에서 성향 테스트 완료 없이 방 입장 가능. `personality: null`, `job: "adventurer"`로 기본값 처리.
- **영향**: 성향 기반 선택지 생성(`choice-generator.ts`)이 `personality: null`을 받으면 폴백 텍스트 사용.
- **해결 방향**: 로비 페이지에서 `profile.characterCreated`가 false이면 배너 표시 + `/trpg/character/create`로 유도.
- **관련 파일**: `src/app/trpg/lobby/page.tsx`, `src/hooks/useGuestProfile.ts`

### 6. 메모리 파이프라인 에러 무음 처리
- **현황**: `runMemorySummarize(session_id).catch(() => {})` — 실패해도 아무것도 기록되지 않음.
- **영향**: 메모리 요약이 누적 실패해도 탐지 불가. NPC 기억이 쌓이지 않아 점점 대화 품질 저하.
- **해결 방향**: 최소한 `console.error`로 로깅. 향후 Supabase에 `error_log` 테이블 추가 고려.
- **관련 파일**: `src/app/api/trpg/game/action/route.ts`, `resolve/route.ts`

### 7. 공통 함수 중복 정의
- **현황**: `defaultDynamicState()`, `clamp()`, `JOB_MODIFIERS`가 `action/route.ts`와 `resolve/route.ts` 두 파일에 각각 정의됨.
- **영향**: 한 쪽 수정 시 다른 쪽을 빠뜨릴 수 있음 (사일런트 버그).
- **해결 방향**: `src/lib/game/action-utils.ts` 파일로 분리하여 양쪽에서 import.
- **관련 파일**: 두 action route 파일

---

## 🟢 발전시키면 좋을 것들

### 8. 온보딩 흐름 강화
- 로비 진입 시 `characterCreated: false`이면 "성향 테스트 미완료" 배너 + 테스트 시작 버튼 표시
- `PersonalityTest` 진행 중 새로고침 시 localStorage에 `pending_personality` 임시 저장하여 이어서 진행 가능하게

### 9. 직업별 초기 스탯 차별화
- **현황**: 모든 직업이 동일한 초기 HP/ATK/DEF 값으로 생성됨.
- **방향**: 직업별 스탯 공식 테이블 (`warrior: hp+20, mage: hp-10, attack-5, mage_power+20` 등)
- **관련 파일**: `src/app/api/trpg/sessions/[sessionId]/join/route.ts`

### 10. 세션 환경 시각화
- `GameSession.session_environment`(날씨, 시간대) 타입은 정의되어 있으나 화면 미표시.
- 게임 화면 상단 헤더에 "🌧 폭우 · 심야" 같은 환경 정보를 표시하면 몰입감 향상.
- **관련 파일**: `src/components/trpg/game/`, `src/lib/types/character.ts`

### 11. 퀘스트 트래커 UI
- `QuestTracker` 타입과 `quest_tracker` 컬럼이 정의되어 있으나 화면 미표시.
- 사이드바에 현재 퀘스트 목표와 달성 여부를 보여주는 패널 추가 가능.
- **관련 파일**: `src/lib/types/character.ts`, `src/components/trpg/game/`

---

## 우선순위 요약

| 순위 | 항목 | 분류 | 난이도 |
|------|------|------|--------|
| 1 | 주사위 서버 롤 | 🔴 보안 | 중 |
| 2 | NPC 조회 RLS 정리 + 서버 API 경유 | 🔴 보안 | 중 |
| 3 | `personality` 화이트리스트 검증 | 🔴 보안 | 소 |
| 4 | 공통 함수 모듈화 | 🟡 코드품질 | 소 |
| 5 | 캐릭터 생성 강제 유도 배너 | 🟡 UX | 소 |
| 6 | 멀티 NPC 지원 | 🟡 기능 | 대 |
| 7 | 메모리 파이프라인 로깅 | 🟡 안정성 | 소 |
| 8 | 직업별 스탯 차별화 | 🟢 게임성 | 소 |
| 9 | 세션 환경 시각화 | 🟢 UX | 소 |
| 10 | 퀘스트 트래커 UI | 🟢 기능 | 중 |
