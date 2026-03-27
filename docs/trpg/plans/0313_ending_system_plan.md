# 엔딩 시스템 구현 계획

> 작성일: 2026-03-13
> 기반 분석: `docs/analysis/0311_gamedesign_analysis.md`
> 관련 PRD: `docs/prd/trpg_basic_v2.md`

---

## 1. 개요 및 목표

현재 `Game_Session.quest_tracker` 필드와 `Scenario.clear_conditions` 필드는 껍데기만 존재하며 실제 게임 로직과 연동이 없다. 이 계획은 **목표(Objective) 기반 엔딩 시스템**을 전면 구현하여:

- 시나리오마다 **10종 목표 유형** 중 하나 이상을 선택 가능하게 한다
- **Dual Clock** 구조(Quest Clock + Doom Clock)로 긴장감을 부여한다
- **3가지 이상의 멀티 엔딩**을 지원하며, GM이 게임 중 자동으로 진척도를 갱신한다
- 플레이어가 현재 목표 상태를 화면에서 명확히 확인할 수 있다

---

## 2. 참고 레퍼런스 요약

| 게임 | 핵심 개념 | 차용 요소 |
|------|-----------|-----------|
| Blades in the Dark | Score-based objective + Clock 시스템 | Dual Clock 구조 |
| Arkham Horror | Doom Track (시간 압박) | Doom Clock 자동 증가 |
| D&D 5e | 3-tier 목표 (메인/서브/비밀) | 목표 우선순위 레이어 |
| Disco Elysium / Fiasco | 멀티 엔딩 + Fail Forward | 실패해도 이야기가 끝나지 않는 결말 |
| Gloomhaven | 개인 퀘스트 + 글로벌 목표 | 플레이어별 서브 목표 |

---

## 3. 데이터 구조 설계

### 3-1. `ScenarioObjectives` (신규)

```typescript
interface ObjectiveCondition {
  type: "eliminate" | "reach" | "find" | "obtain" | "protect"
       | "survive" | "solve" | "reveal" | "escort" | "choose";
  target_description: string;      // 예: "NPC 카림을 마을 밖으로 데려간다"
  target_npc_id?: string;          // 특정 NPC 연동 시
  progress_max: number;            // 클락 최대값 (보통 4 또는 6)
  is_hidden?: boolean;             // 플레이어에게 숨겨진 목표 여부
}

interface ScenarioObjectives {
  primary: ObjectiveCondition;     // 메인 목표 (1개, 필수)
  secondary?: ObjectiveCondition[]; // 서브 목표 (0~3개)
  secret?: ObjectiveCondition;     // 숨겨진 목표 (0~1개, GM only)
  doom_clock_interval: number;     // 몇 턴마다 Doom Clock +1
  doom_clock_max: number;          // Doom Clock 최대값 (초과 시 Bad End)
}
```

### 3-2. `ScenarioEndings` (신규)

```typescript
interface EndingCondition {
  id: string;
  label: string;                   // "완전한 승리", "절반의 승리", "패배", "비밀 엔딩"
  description: string;             // 결말 설명 (GM 나레이션 생성 시 참고)
  trigger: "primary_complete"
          | "primary_failed"
          | "doom_maxed"
          | "secret_complete"
          | "custom";
  custom_condition?: string;       // trigger="custom" 일 때 GM에게 전달할 판단 지침
  tone: "triumphant" | "bittersweet" | "tragic" | "mysterious";
}

interface ScenarioEndings {
  endings: EndingCondition[];      // 최소 2개, 권장 3~4개
}
```

### 3-3. `QuestTracker` 확장

```typescript
interface QuestTracker {
  // 기존
  current_scene: string;
  scene_progress: number;
  // 신규
  primary_progress: number;        // 메인 목표 진척도 (0 ~ progress_max)
  secondary_progress: number[];    // 서브 목표별 진척도 배열
  secret_triggered: boolean;       // 비밀 목표 발동 여부
  quest_clock: number;             // 플레이어 행동으로 증가
  doom_clock: number;              // N턴마다 자동 증가
  doom_clock_interval: number;     // 미러: Scenario.objectives에서 복사
  doom_clock_max: number;          // 미러: Scenario.objectives에서 복사
  turn_count: number;              // 총 턴 수 (doom_clock 계산용)
  ended: boolean;                  // 게임 종료 여부
  ending_id?: string;              // 달성된 엔딩 ID
}
```

---

## 4. 구현 단계 (13 Steps)

### Step 1. DB 마이그레이션

**파일**: `supabase/migrations/008_objectives_endings.sql`

```sql
ALTER TABLE "Scenario"
  ADD COLUMN IF NOT EXISTS objectives  jsonb,
  ADD COLUMN IF NOT EXISTS endings     jsonb;

-- quest_tracker에 새 필드가 추가되므로 기존 JSONB 컬럼은 자동 확장
-- turn_count, doom_clock, doom_clock_interval 등은 quest_tracker 내부
```

### Step 2. TypeScript 타입 추가

**파일**: `src/lib/types/game.ts`

- `ScenarioObjectives`, `ObjectiveCondition`, `ScenarioEndings`, `EndingCondition` 인터페이스 추가
- `QuestTracker` 에 신규 필드 추가
- `Scenario` 타입에 `objectives?: ScenarioObjectives`, `endings?: ScenarioEndings` 추가

**파일**: `src/lib/types/database.ts`

- `Scenario` 테이블 타입에 `objectives`, `endings` 컬럼 추가

### Step 3. `objective-engine.ts` 모듈 (신규)

**파일**: `src/lib/game/objective-engine.ts`

핵심 함수:
```typescript
// GM 응답에서 목표 진척도 업데이트
function applyObjectiveUpdate(
  tracker: QuestTracker,
  update: GmObjectiveUpdate
): { tracker: QuestTracker; endingId?: string }

// Doom Clock 틱 (매 턴 호출)
function tickDoomClock(tracker: QuestTracker): QuestTracker

// 엔딩 조건 평가
function evaluateEndings(
  tracker: QuestTracker,
  objectives: ScenarioObjectives,
  endings: ScenarioEndings
): EndingCondition | null

// 초기 QuestTracker 생성 (세션 시작 시)
function initQuestTracker(objectives: ScenarioObjectives): QuestTracker
```

### Step 4. `generate-objectives` API (신규)

**파일**: `src/app/api/trpg/scenarios/generate-objectives/route.ts`

- Gemini에게 시나리오 설정(배경, NPC 목록, 장르)을 주고 `ScenarioObjectives` + `ScenarioEndings` JSON 자동 생성
- 시나리오 생성 Flow에서 호출되거나, 어드민/유저가 직접 수동 입력도 가능

### Step 5. 시나리오 생성 API 업데이트

**파일**: `src/app/api/trpg/scenarios/route.ts`

- POST 핸들러에서 `objectives`, `endings` 필드 수신 및 DB 저장

### Step 6. 세션 생성 시 QuestTracker 초기화

**파일**: `src/app/api/trpg/sessions/route.ts`

- `POST /api/trpg/sessions` 에서 `Scenario.objectives`를 읽어 `initQuestTracker()` 호출
- `Game_Session.quest_tracker`에 저장

### Step 7. `gm-agent.ts` 업데이트

**파일**: `src/lib/gemini/gm-agent.ts`

- `GmActionInput`에 `objectives?: ScenarioObjectives`, `questTracker?: QuestTracker` 추가
- `GmRawResponse`에 `quest_update?: GmObjectiveUpdate` 추가
- `buildSystemInstruction`에 목표 진척도 갱신 규칙 추가
  - "플레이어의 행동이 목표에 직접 기여하면 `quest_update.primary_delta` 를 +1"
  - "서브 목표는 `secondary_delta[index]` 로 갱신"
  - "비밀 목표 조건이 충족되면 `secret_triggered: true`"

```typescript
interface GmObjectiveUpdate {
  primary_delta?: number;         // 메인 목표 진척도 변화 (-1 ~ +2)
  secondary_delta?: number[];     // 서브 목표 변화 배열
  secret_triggered?: boolean;     // 비밀 목표 달성
  reason?: string;                // 왜 진척됐는지 (로그용)
}
```

### Step 8. Action Route 업데이트

**파일**: `src/app/api/trpg/game/action/route.ts`
**파일**: `src/app/api/trpg/game/action/resolve/route.ts`

두 파일 모두:
1. `scenario.objectives`, `session.quest_tracker` 조회
2. GM 호출 시 전달
3. GM 응답에서 `quest_update` 추출
4. `applyObjectiveUpdate()` → 새 tracker 계산
5. `tickDoomClock()` → doom_clock 자동 증가
6. `evaluateEndings()` → 엔딩 조건 평가
7. 엔딩 달성 시: `Game_Session.status = "completed"`, `quest_tracker.ended = true`, `quest_tracker.ending_id` 저장
8. `quest_tracker` DB 업데이트

### Step 9. 시나리오 생성 UI — Step D 추가

**파일**: `src/components/trpg/ScenarioCreateStep.tsx` (또는 해당 시나리오 생성 컴포넌트)

새 Step D: **"게임 목표 설정"**
- 목표 유형 선택 (드롭다운): 10종 중 선택
- 목표 설명 텍스트 입력
- Doom Clock 간격/최대값 슬라이더
- "자동 생성" 버튼 → `generate-objectives` API 호출
- 엔딩 2~4개 설정 폼 (레이블 + 설명 + 달성 조건)

### Step 10. `QuestTrackerPanel` 리디자인

**파일**: `src/components/trpg/game/QuestTrackerPanel.tsx`

현재 단순 JSON 표시에서 → 시각적 패널로:
```
[메인 목표] 카림을 마을 밖으로 데려간다
  ████░░  2/4

[서브 목표] 경비대의 의심을 피한다
  ██░░░░  1/6

[위기 시계] ████████░░  8/10
```
- Quest Clock (플레이어 진척)은 초록색
- Doom Clock (자동 카운트다운)은 빨간색
- 비밀 목표는 `???` 로 숨김 처리 (달성 시 공개)

### Step 11. `EndingScreen.tsx` 신규 컴포넌트

**파일**: `src/components/trpg/game/EndingScreen.tsx`

- `ended === true` 감지 시 전체화면 오버레이
- 달성된 엔딩 타입에 따라 애니메이션/색상 변경
  - `triumphant`: 금색 파티클
  - `bittersweet`: 흰색 페이드
  - `tragic`: 붉은 글리치 효과
  - `mysterious`: 안개 페이드
- GM이 생성한 최종 나레이션 출력
- "로비로 돌아가기" 버튼

### Step 12. `useGameScreen.ts` 업데이트

- `session.quest_tracker.ended` 감지 → `gameEnded` state
- Realtime 구독에서 `quest_tracker` 변화 감지 → `QuestTrackerPanel` 리렌더
- `ending_id` 추출 → `EndingScreen`에 전달

### Step 13. `GamePage` 업데이트

- `gameEnded` 시 `EndingScreen` 렌더
- `QuestTrackerPanel` 에 `objectives`, `questTracker` props 전달

---

## 5. 목표 유형 10종 상세

| 유형 | 설명 | 예시 |
|------|------|------|
| `eliminate` | 특정 NPC/위협 제거 | "악당 우두머리를 처치한다" |
| `reach` | 특정 장소 도달 | "지하 신전에 도착한다" |
| `find` | 정보/물건 발견 | "살인 사건의 진상을 밝힌다" |
| `obtain` | 아이템 획득 | "성배를 손에 넣는다" |
| `protect` | NPC/장소 보호 | "마을이 불타지 않도록 막는다" |
| `survive` | N턴 생존 | "夜이 밝을 때까지 버틴다" |
| `solve` | 퍼즐/수수께끼 해결 | "암호를 해독한다" |
| `reveal` | 숨겨진 사실 폭로 | "배신자의 정체를 밝힌다" |
| `escort` | NPC 동행/호위 | "상인을 안전하게 항구까지 데려간다" |
| `choose` | 분기점 선택 | "왕관을 쓸 인물을 결정한다" |

---

## 6. 엔딩 타입 예시 (시나리오 "탈출")

```json
{
  "endings": [
    {
      "id": "full_victory",
      "label": "완전한 탈출",
      "description": "카림과 함께 마을을 무사히 벗어났다. 진실은 밝혀질 것이다.",
      "trigger": "primary_complete",
      "tone": "triumphant"
    },
    {
      "id": "pyrrhic_victory",
      "label": "홀로 탈출",
      "description": "카림을 지키지 못했지만, 당신만은 살아남았다.",
      "trigger": "custom",
      "custom_condition": "플레이어는 탈출했으나 카림은 사망하거나 체포된 경우",
      "tone": "bittersweet"
    },
    {
      "id": "doom_end",
      "label": "체포",
      "description": "도망치기엔 너무 늦었다. 경비대가 당신을 포위했다.",
      "trigger": "doom_maxed",
      "tone": "tragic"
    },
    {
      "id": "secret_end",
      "label": "진실의 증인",
      "description": "탈출보다 중요한 것을 발견했다. 이 증거가 세상을 바꿀 수도 있다.",
      "trigger": "secret_complete",
      "tone": "mysterious"
    }
  ]
}
```

---

## 7. 관련 파일 목록

### 신규 생성
| 파일 | 용도 |
|------|------|
| `supabase/migrations/008_objectives_endings.sql` | DB 컬럼 추가 |
| `src/lib/game/objective-engine.ts` | 목표 진척/엔딩 평가 로직 |
| `src/app/api/trpg/scenarios/generate-objectives/route.ts` | Gemini 기반 자동 목표 생성 |
| `src/components/trpg/game/EndingScreen.tsx` | 엔딩 전체화면 컴포넌트 |

### 수정 필요
| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/types/game.ts` | 신규 타입 추가, QuestTracker 확장 |
| `src/lib/types/database.ts` | Scenario 테이블 컬럼 추가 |
| `src/lib/gemini/gm-agent.ts` | quest_update 출력 + 목표 컨텍스트 입력 |
| `src/app/api/trpg/scenarios/route.ts` | objectives/endings 저장 |
| `src/app/api/trpg/sessions/route.ts` | initQuestTracker 호출 |
| `src/app/api/trpg/game/action/route.ts` | 목표 업데이트 + 엔딩 평가 |
| `src/app/api/trpg/game/action/resolve/route.ts` | 동일 |
| `src/components/trpg/ScenarioCreateStep.tsx` | Step D 추가 |
| `src/components/trpg/game/QuestTrackerPanel.tsx` | 시각적 Clock UI |
| `src/hooks/useGameScreen.ts` | ended 감지 + 엔딩 state |
| `src/app/trpg/game/[sessionId]/page.tsx` | EndingScreen 렌더 |

---

## 8. 구현 우선순위

1. **Step 1~3** (기반): DB + 타입 + 엔진 모듈
2. **Step 6~8** (서버): 세션 초기화 + GM 연동 + Action 파이프라인
3. **Step 9~11** (클라이언트): UI 컴포넌트
4. **Step 4~5** (부가): 자동 생성 API (어드민이 수동 입력도 가능하므로 마지막)

> 전체 구현 예상 작업량: 중간 규모 (약 15개 파일 신규/수정)
