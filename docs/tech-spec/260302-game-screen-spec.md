# Tech Spec: 게임 진행 화면 & GM 에이전트

**Feature**: game-screen
**Date**: 2026-03-02
**PRD**: `docs/prd/260302-game-screen.md`

---

## 1. 프로젝트 호환성 확인

| 항목 | 현황 | 판정 |
|------|------|------|
| 아키텍처 | Next.js App Router, 기능별 `src/` 분리 | ✅ 적합 |
| 상태 관리 | 커스텀 훅 (useState/useEffect) | ✅ 적합 |
| 스타일링 | Tailwind CSS v4 | ✅ 적합 |
| DB | Supabase (Service Role Key, RLS 우회) | ✅ 적합 |
| Realtime | Supabase Realtime (postgres_changes) | ✅ 이미 구현됨 |
| AI | Gemini API (`@google/generative-ai`) | ✅ 클라이언트 완비 |
| 테스트 | 없음 | — 수동 테스트로 대체 |

---

## 2. 기존 코드 재사용 분석

### 그대로 사용 가능
| 파일 | 설명 |
|------|------|
| `src/lib/gemini/client.ts` | Gemini 클라이언트 완성, 변경 없음 |
| `src/lib/game/turn-manager.ts` | `getNextTurn()`, `buildTurnOrder()`, `isPlayerTurn()` 완성 |
| `src/lib/game/action-resolver.ts` | `applyStateChanges()` 완성, `buildActionLog()`는 수정 필요 |
| `src/hooks/useRealtimeSync.ts` | 구조 재사용, Player_Character 구독 추가 필요 |
| `src/lib/types/game.ts` | 대부분 완성, `GmResponse`에 `dice_roll` 필드 추가 필요 |
| `src/lib/supabase/server.ts` | `createServiceClient()` 그대로 사용 |

### 수정 필요
| 파일 | 이유 |
|------|------|
| `src/lib/gemini/gm-agent.ts` | 하드코딩된 `GM_SYSTEM_PROMPT` → 시나리오 DB 프롬프트로 교체, dice_roll 출력 추가 |
| `src/lib/game/choice-generator.ts` | `PersonalityProfile` 의존 → 게스트 유저의 `avatar:N` 기반으로 전환 |
| `src/hooks/useGameSession.ts` | `player_id` 누락, 로그 조회 없음, Realtime 미통합 → 전면 재작성 |
| `src/app/trpg/game/[sessionId]/page.tsx` | 서버 컴포넌트 → 클라이언트 컴포넌트로 전환 |

### 새로 구현
| 파일 | 설명 |
|------|------|
| `src/app/api/trpg/game/action/route.ts` | POST: 5단계 판정 파이프라인 |
| `src/app/api/trpg/game/choices/route.ts` | POST: 선택지 3개 생성 |
| `src/app/api/trpg/game/session/[sessionId]/route.ts` | GET: 세션 + 플레이어 + 로그 조회 |
| `src/hooks/useGameScreen.ts` | 게임 화면 전용 통합 훅 |
| `src/components/trpg/game/ChatLog.tsx` | 채팅 로그 (다이스카드, HP카드 포함) |
| `src/components/trpg/game/ActionPanel.tsx` | 행동 패널 |
| `src/components/trpg/game/CharacterStatus.tsx` | 내 캐릭터 사이드바 |
| `src/components/trpg/game/PlayerList.tsx` | 플레이어 목록 사이드바 |
| `src/components/trpg/game/TurnIndicator.tsx` | 현재 턴 표시 |

---

## 3. 타입 설계

### 3-1. GmResponse 확장 (`src/lib/types/game.ts`)

```typescript
export interface DiceRoll {
  rolled: number;       // d20 결과 (1~20)
  modifier: number;     // 직업 보너스
  total: number;        // rolled + modifier
  label: string;        // 예: "근력 판정", "민첩 판정"
}

// 기존 GmResponse에 dice_roll 추가
export interface GmResponse {
  narration: string;
  outcome: ActionOutcome;
  state_changes: StateChanges[];
  dice_roll?: DiceRoll;       // 추가
  next_scene_hint?: string;
}
```

### 3-2. 확장 ActionLog (DB 저장용 state_changes 구조)

```typescript
// Action_Log.state_changes JSONB에 저장되는 구조 (snake_case)
// 플레이어 로그: { dice_roll: DiceRoll }
// GM 로그: { hp_changes: HpChange[] }
export interface HpChange {
  target_id: string;
  name: string;
  old_hp: number;
  new_hp: number;
  delta: number;
}
```

### 3-3. 게임 화면 상태 (`useGameScreen` 반환값)

```typescript
interface GameScreenState {
  // 데이터
  session: GameSession | null;
  scenario: Scenario | null;
  players: RawPlayer[];          // DB에서 온 raw 플레이어 목록
  logs: ActionLog[];
  myPlayer: RawPlayer | null;    // localId로 식별한 내 캐릭터

  // UI 상태
  isMyTurn: boolean;
  choices: ActionChoice[];
  choicesLoading: boolean;
  isSubmitting: boolean;
  loading: boolean;
  error: string | null;

  // 액션
  submitAction: (content: string, type: "choice" | "free_input") => Promise<void>;
}

// DB에서 직접 온 플레이어 (character.ts의 PlayerCharacter와 다름)
interface RawPlayer {
  id: string;
  session_id: string;
  user_id: string;         // localId
  player_name: string;
  character_name: string;
  job: string;
  personality_summary: string | null;  // "avatar:N"
  stats: { hp: number; max_hp: number; attack: number; defense: number; speed: number };
  is_active: boolean;
}
```

---

## 4. API 설계

### 4-1. GET `/api/trpg/game/session/[sessionId]`

**요청**: 없음 (세션 ID는 URL)

**응답**:
```json
{
  "session": { "id": "...", "status": "in_progress", "current_turn_player_id": "...", "turn_order": [...], "turn_number": 3, ... },
  "scenario": { "gm_system_prompt": "...", "fixed_truths": {...}, ... },
  "players": [{ "id": "...", "user_id": "...", "player_name": "...", "stats": {...}, ... }],
  "logs": [ /* 최근 30개, created_at 오름차순 */ ]
}
```

**에러**: 404 (세션 없음), 403 (in_progress 아님)

---

### 4-2. POST `/api/trpg/game/choices`

**요청**:
```json
{ "session_id": "...", "player_id": "...", "local_id": "..." }
```

**처리**:
1. 세션 + 시나리오 + 플레이어 조회
2. `Action_Log` 최근 10개 조회 → `currentSituation` 문자열 구성
3. `personality_summary` (`avatar:N`) → 아바타 인덱스별 성향 스타일 매핑
4. Gemini 호출 (`generateChoices` 수정본)
5. 실패 시 폴백 선택지 3개 반환

**응답**:
```json
{
  "choices": [
    { "id": "choice_1", "label": "...", "description": "...", "action_type": "choice" },
    ...
  ]
}
```

**아바타 → 성향 스타일 매핑**:
```
0(빨강): 공격적·대담 / 1(주황): 모험적 / 2(노랑): 호기심·쾌활
3(초록): 신중·전술적 / 4(청록): 사교적·외교적 / 5(파랑): 분석적·지혜로운
6(보라): 신비로운·마법적 / 7(분홍): 매력적·창의적
```

---

### 4-3. POST `/api/trpg/game/action`

**요청**:
```json
{
  "session_id": "...",
  "player_id": "...",       // Player_Character.id
  "local_id": "...",        // user_id 확인용
  "action_type": "choice | free_input",
  "content": "플레이어 행동 텍스트"
}
```

**처리 순서** (5단계):

```
Step 1: 검증
  - session.status === 'in_progress'
  - session.current_turn_player_id === player_id
  - 플레이어가 session 참여자인지 확인

Step 2: 주사위 판정 (서버 사이드)
  - d20 = Math.ceil(Math.random() * 20)
  - modifier = JOB_MODIFIERS[player.job] (warrior:+2, mage:+2, rogue:+2, cleric:+2, adventurer:0)
  - total = d20 + modifier
  - outcome = total >= 19 또는 d20 === 20 → 'critical_success'
             total 15~18 → 'success'
             total 10~14 → 'partial'
             total <= 9  → 'failure'
  - DiceRoll 객체 생성

Step 3: 플레이어 행동 Action_Log INSERT
  - speaker_type: 'player'
  - action_type: 'choice' | 'free_input'
  - content: 플레이어 행동 텍스트
  - outcome: 판정 결과
  - state_changes: { dice_roll: DiceRoll }

Step 4: Gemini GM 호출
  - system: scenario.gm_system_prompt (DB에서 가져온 시나리오별 프롬프트)
  - context: 최근 Action_Log 10개 + 플레이어 정보 + 행동 + 판정 결과
  - prompt: "판정 결과: [outcome] (주사위 [d20]+[mod]=[total]). 이에 맞는 나레이션과 상태 변화를 JSON으로 반환하라."
  - 실패 시: 시스템 오류 메시지 GM 로그 INSERT + 턴 넘김

Step 5: GM 나레이션 Action_Log INSERT
  - speaker_type: 'gm'
  - action_type: 'gm_narration'
  - content: narration
  - outcome: outcome (Step 2의 결과와 동일)
  - state_changes: { hp_changes: [...] }
    각 hp_change = { target_id, name, old_hp, new_hp, delta }

Step 6: HP 반영
  - state_changes의 각 target에 대해 Player_Character.stats UPDATE
  - stats는 JSONB, jsonb_set으로 hp 필드만 변경
  - hp = max(0, min(max_hp, old_hp + delta))

Step 7: 턴 전진
  - getNextTurn(session) → nextTurn
  - Game_Session UPDATE: current_turn_player_id, turn_number += 1
```

**응답**:
```json
{ "ok": true, "outcome": "success", "dice_roll": { "rolled": 17, "modifier": 2, "total": 19, "label": "판정" } }
```

---

## 5. GM 에이전트 수정 (`src/lib/gemini/gm-agent.ts`)

### 변경사항
1. `systemInstruction`을 `GM_SYSTEM_PROMPT` 상수 → `scenarioSystemPrompt` 파라미터로 교체
2. context에 판정 결과(outcome, dice_roll) 포함 → Gemini가 결과에 맞는 나레이션 생성

```typescript
interface GmActionInput {
  scenarioSystemPrompt: string;   // DB에서 온 시나리오별 프롬프트 (추가)
  fixedTruths: Record<string, unknown>;  // 추가
  recentLogs: ActionLog[];
  actingPlayer: RawPlayer;        // PlayerCharacter → RawPlayer로 변경
  action: string;
  actionType: "choice" | "free_input";
  diceRoll: DiceRoll;             // 추가 (서버에서 이미 굴린 결과)
  outcome: ActionOutcome;         // 추가 (서버에서 이미 판정한 결과)
}
```

### 프롬프트 구성

```
[scenario.gm_system_prompt]  ← 시나리오별 지시 (판정 기준, 세계관 등)

## 고정 진실
[scenario.fixed_truths JSON]

## 최근 기록
[최근 10개 로그]

## 현재 행동
[player.player_name]: [action]

## 판정 결과 (서버 확정)
- 주사위: d20=[rolled] + 보너스=[modifier] = [total]
- 결과: [outcome] (critical_success|success|partial|failure)

위 판정 결과에 맞는 나레이션과 상태 변화를 JSON으로 반환하라.
```

---

## 6. 선택지 생성기 수정 (`src/lib/game/choice-generator.ts`)

```typescript
// avatar index → 행동 스타일 매핑 추가
const AVATAR_STYLE: Record<number, string> = {
  0: "공격적이고 대담한 행동을 선호",
  1: "모험적이고 위험을 감수하는 행동을 선호",
  2: "호기심 많고 탐색적인 행동을 선호",
  3: "신중하고 전술적인 행동을 선호",
  4: "사교적이고 외교적인 접근을 선호",
  5: "분석적이고 신중하게 상황을 파악하는 행동을 선호",
  6: "신비롭고 마법적 해결책을 찾는 행동을 선호",
  7: "창의적이고 예상치 못한 행동을 선호",
};

// personality_summary 'avatar:N' 파싱
export function parseAvatarStyle(personalitySummary: string | null): string {
  const match = personalitySummary?.match(/avatar:(\d)/);
  const idx = match ? parseInt(match[1]) : 0;
  return AVATAR_STYLE[idx] ?? AVATAR_STYLE[0];
}
```

---

## 7. 훅 설계 (`src/hooks/useGameScreen.ts`)

```
useGameScreen(sessionId, localId)
├── 초기 로드: GET /api/trpg/game/session/[sessionId]
│   → session, scenario, players, logs 설정
│   → myPlayer 식별 (user_id === localId)
│   → 비정상 접근 리다이렉트
│
├── Realtime 구독 (3개 채널)
│   ├── Action_Log INSERT → logs 배열 append + 자동 스크롤
│   ├── Game_Session UPDATE → session.current_turn_player_id 갱신
│   │   └── isMyTurn 변경 시 선택지 자동 생성 트리거
│   └── Player_Character UPDATE → players 배열 hp 갱신
│
├── isMyTurn 감지 시
│   → POST /api/trpg/game/choices → choices 설정
│   → 실패 시 FALLBACK_CHOICES 사용
│
└── submitAction(content, type)
    → isSubmitting = true
    → POST /api/trpg/game/action
    → isSubmitting = false (Realtime으로 UI는 자동 업데이트)
```

**폴백 선택지 상수**:
```typescript
const FALLBACK_CHOICES: ActionChoice[] = [
  { id: "f1", label: "신중하게 접근한다", description: "상황을 면밀히 살피며 조심스럽게 나아간다.", action_type: "choice" },
  { id: "f2", label: "대담하게 행동한다", description: "위험을 무릅쓰고 과감하게 돌파한다.", action_type: "choice" },
  { id: "f3", label: "상황을 관찰한다", description: "잠시 멈추고 주변을 살피며 정보를 모은다.", action_type: "choice" },
];
```

---

## 8. 컴포넌트 설계

### ChatLog.tsx
- `logs: ActionLog[]` prop 수신
- 로그 항목 타입별 렌더링:
  - `speaker_type === 'system'` → 시스템 메시지 (중앙 소형 텍스트)
  - `speaker_type === 'player'` → 플레이어 버블 + 다이스 카드 (`state_changes.dice_roll` 존재 시)
  - `speaker_type === 'gm'` → GM 나레이션 + 판정 배너 + HP 변화 카드 (`state_changes.hp_changes` 존재 시)
- `useEffect`로 새 로그 추가 시 `scrollRef.current?.scrollToEnd()`

### ActionPanel.tsx
- props: `isMyTurn`, `currentTurnName`, `choices`, `choicesLoading`, `isSubmitting`, `onSubmit`
- 상태별 렌더링:
  - 내 턴 + 로딩 중: 스켈레톤 3개
  - 내 턴 + 선택지 있음: 선택지 버튼 + 직접 입력
  - 타인 턴: "○○의 턴입니다" + 스피너
  - GM 판정 중: 황금 스피너

### CharacterStatus.tsx, PlayerList.tsx, TurnIndicator.tsx
- `players`, `myPlayer`, `session.current_turn_player_id` prop 기반
- HP 바 색상: `hp/max_hp >= 0.6` → green, `>= 0.3` → yellow, `< 0.3` → red

---

## 9. DB 접근 패턴

### Player_Character stats 업데이트
```sql
UPDATE "Player_Character"
SET stats = jsonb_set(stats, '{hp}', to_jsonb($1::int), false),
    updated_at = NOW()
WHERE id = $2
```
→ Supabase에서는:
```typescript
await supabase
  .from("Player_Character")
  .update({ stats: { ...player.stats, hp: newHp } })
  .eq("id", targetId);
```

### 초기 로드 쿼리 (3개 분리 호출)
```typescript
// 1. 세션 + 시나리오
supabase.from("Game_Session").select("*, Scenario(*)").eq("id", sessionId).single()

// 2. 플레이어 목록
supabase.from("Player_Character").select("*").eq("session_id", sessionId).eq("is_active", true)

// 3. 최근 로그
supabase.from("Action_Log").select("*").eq("session_id", sessionId).order("created_at").limit(30)
```

---

## 10. 직업 보너스 상수

```typescript
// src/app/api/trpg/game/action/route.ts 내부 상수
const JOB_MODIFIERS: Record<string, number> = {
  warrior: 2, mage: 2, rogue: 2, cleric: 2, adventurer: 0,
  ranger: 2, paladin: 2, bard: 1,
};
```

---

## 11. DB 스키마 변경 없음

- `Action_Log.state_changes` JSONB 필드를 `{ dice_roll: ... }` 또는 `{ hp_changes: [...] }` 형태로 활용
- `CHECK (action_type IN (...))` 제약 변경 불필요 (기존 `gm_narration`, `choice`, `free_input` 그대로 사용)
- 추가 마이그레이션 없음

---

## 12. 구현 Phase 계획

| Phase | 작업 | 파일 |
|-------|------|------|
| A | 타입 확장 | `game.ts` (DiceRoll, HpChange 추가) |
| B | 백엔드 | `gm-agent.ts` 수정, `choice-generator.ts` 수정, API 3개 구현 |
| C | 훅 | `useGameScreen.ts` 신규 |
| D | UI 컴포넌트 | ChatLog, ActionPanel, CharacterStatus, PlayerList, TurnIndicator |
| E | 페이지 연결 | `game/[sessionId]/page.tsx` 클라이언트 전환 + 훅 연결 |
| F | 빌드 검증 | `npm run build` 통과 확인 |
