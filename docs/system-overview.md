# AI 다이내믹 TRPG 시스템 개요

> 작성일: 2026-03-09
> 기준 커밋: `d3184dc` (feat: implement NPC dynamic persona system P1~P7)

---

## 목차

1. [시스템 철학](#1-시스템-철학)
2. [캐릭터 생성 — 플레이어 정체성 수집](#2-캐릭터-생성--플레이어-정체성-수집)
3. [선택지 생성 — 성향 기반 행동 제안](#3-선택지-생성--성향-기반-행동-제안)
4. [행동 판정 — 결정론적 주사위 시스템](#4-행동-판정--결정론적-주사위-시스템)
5. [NPC 내면 — 17개 심리 변수](#5-npc-내면--17개-심리-변수)
6. [취향 모디파이어 — 감정 역전 엔진](#6-취향-모디파이어--감정-역전-엔진)
7. [상대적 연령 인지 — 종족별 생애주기](#7-상대적-연령-인지--종족별-생애주기)
8. [세계관 지식 — Lore Queue 시스템](#8-세계관-지식--lore-queue-시스템)
9. [NPC의 기억 — 주관적 편향 메모리](#9-npc의-기억--주관적-편향-메모리)
10. [8블록 프롬프트 — 최종 NPC 조립](#10-8블록-프롬프트--최종-npc-조립)
11. [전체 턴 흐름 요약](#11-전체-턴-흐름-요약)
12. [핵심 파일 맵](#12-핵심-파일-맵)

---

## 1. 시스템 철학

이 TRPG 시스템의 핵심 목표는 **"NPC가 진짜 사람처럼 느껴지는 경험"** 입니다.

대부분의 AI 채팅 기반 롤플레이는 두 가지 근본적인 문제를 가집니다.

| 문제 | 원인 | 결과 |
|------|------|------|
| AI 할루시네이션 | DC, 성패 여부를 AI가 임의 결정 | 매 턴 불공정하고 일관성 없는 판정 |
| 기억 없는 NPC | 채팅 히스토리만 사용 | 100턴 전 사건을 NPC가 기억 못 함 |

이 시스템은 두 문제를 다음 설계로 해결합니다.

- **결정론적 게임 룰** — DC, 주사위, 성패는 서버가 100% 결정. AI는 서술만 담당.
- **다층적 NPC 심리** — 17개 실시간 변수 + 편향된 주관적 기억 + 취향 모디파이어.
- **토큰 효율** — 세계관 지식을 매 턴 전부 주입하는 대신, 키워드 트리거 시에만 주입.

---

## 2. 캐릭터 생성 — 플레이어 정체성 수집

**경로:** `/trpg/character/create`
**저장:** `Player_Character.personality: PersonalityProfile`

플레이어는 대화형 성향 테스트를 통해 3가지 지표를 획득합니다.

```typescript
interface PersonalityProfile {
  mbti: MBTIType | null;           // 예: "INFJ"
  enneagram: EnneagramType | null; // 예: 4
  dnd_alignment: DnDAlignment | null; // 예: "chaotic-good"
  summary: string;
}
```

이 데이터는 이후 선택지 생성, NPC 반응, 연령 인지 등 모든 게임 경험의 입력값이 됩니다.

---

## 3. 선택지 생성 — 성향 기반 행동 제안

**파일:** `src/lib/game/choice-generator.ts`
**API:** `POST /api/trpg/game/choices`

내 턴이 시작되면 플레이어의 성향을 Gemini에 주입해 **성향 맞춤 선택지 3개**를 자동 생성합니다.

### 성향 → 프롬프트 변환

`buildPersonalityDescription()`이 3가지 지표를 자연어로 변환합니다.

```
MBTI INFJ: 통찰력 있고 이상주의적, 타인의 감정에 민감
에니어그램 4번: 독창적이고 감성적, 자신의 정체성과 의미 추구
D&D chaotic-good: 자유롭게 선을 추구, 규칙보다 결과 중시
```

### 결과 예시

같은 상황, 다른 플레이어:

| 성향 | 생성되는 선택지 경향 |
|------|---------------------|
| ENFP + 에니어그램 7번 | "즉흥적으로 뛰어들어 대담하게 말을 건다" |
| ISTJ + 에니어그램 1번 | "상황을 체계적으로 분석하고 원칙에 따라 행동한다" |
| INFJ + 에니어그램 4번 | "상대의 감정을 읽고 공감하며 조심스럽게 접근한다" |

일부 선택지에는 주사위 판정 정보(`dice_check`)가 포함되어, 선택 즉시 판정 오버레이가 열립니다.

---

## 4. 행동 판정 — 결정론적 주사위 시스템

**파일:** `src/lib/game/dc-calculator.ts`
**API:** `POST /api/trpg/game/action` → `POST /api/trpg/game/action/resolve`

### 2-Phase 흐름

```
Phase 1 (action/route.ts)
  플레이어 행동 제출
    → Gemini: 행동 분류(ActionCategory)만 반환
    → 서버: NPC resistance_stats 기반 DC 계산
    → needs_dice_check: true → 클라이언트에 DC 반환

Phase 2 (resolve/route.ts)
  d20 애니메이션 종료 후 rolled 값 서버 전송
    → 서버: action_category로 DC 재검증 (클라이언트 조작 방지)
    → 서버: 판정 결과 확정
    → Gemini: 결과에 맞는 서사 서술
```

### DC 계산 규칙

| ActionCategory | 기준 저항 스탯 |
|----------------|---------------|
| `attack` / `threaten` | `resistance_stats.physical_defense` |
| `persuade` | `resistance_stats.mental_willpower` |
| `deceive` / `stealth` | `resistance_stats.perception` |
| `gift` / `none` | 판정 없음 |

### 판정 결과 기준

| 조건 | 결과 |
|------|------|
| d20 = 20 | `critical_success` (크리티컬) |
| total ≥ DC + 5 | `success` |
| total ≥ DC | `partial` (부분 성공) |
| total < DC | `failure` |

`total = d20 + 직업 보너스 (warrior/mage/rogue +2, bard +1, adventurer +0)`

> **설계 원칙:** AI는 절대 DC를 결정하지 않습니다. DC는 NPC 스탯에서 서버가 계산하고, AI는 "판정이 필요한지"와 "어떤 종류의 행동인지"만 분류합니다.

---

## 5. NPC 내면 — 17개 심리 변수

**저장:** `Game_Session.npc_dynamic_states: Record<npcId, NpcDynamicState>`

NPC는 매 턴마다 실시간으로 변하는 17개 심리 변수를 가집니다.

```typescript
interface NpcDynamicState {
  // 단기 휘발성 (빠르게 변함)
  current_mood: string;           // 현재 감정 텍스트
  mental_stress: number;          // 0~100
  physical_fatigue: number;       // 0~100
  fear_survival: number;          // 0~100 ← 80 초과 시 공포 셧다운 발동
  self_image_management: number;  // 평판 관리 욕구 0~100
  mob_mentality: number;          // 군중 심리 0~100

  // 장기 누적 (플레이어와의 관계)
  affinity: number;        // 호감도 -100~100
  trust: number;           // 신뢰도 -100~100
  power_dynamics: string;  // 권력 우위 텍스트
  personal_debt: number;   // 부채의식 0~100
  sense_of_duty: number;   // 의무감 0~100
  camaraderie: number;     // 전우애 0~100
}
```

### 공포 셧다운

`fear_survival ≥ 80`이 되면 **의무감, 신뢰도, 자존심 등 모든 변수를 무시**하고 NPC가 도망치거나 항복하는 오버라이드가 발동됩니다. 8블록 프롬프트에 경고가 직접 삽입됩니다.

---

## 6. 취향 모디파이어 — 감정 역전 엔진

**파일:** `src/lib/game/taste-modifier-engine.ts`

매 턴 플레이어의 텍스트를 NPC의 `taste_preferences` 키워드 목록과 대조합니다. 매칭 시 감정 변화량의 **부호와 배율**을 조정합니다.

```typescript
interface TastePreference {
  trigger_keywords: string[];   // 예: ["거칠게", "명령", "협박"]
  modifiers: {
    affinity_multiplier?: number;  // 음수 = 부호 역전
    stress_multiplier?: number;
    fear_multiplier?: number;
  };
}
```

### 결과 예시

> NPC가 "거친 대우"를 즐기는 취향을 가진 경우:
>
> - 플레이어: "이 멍청아, 당장 비켜!"
> - 일반적 처리: `affinity -= 10`
> - 취향 매칭 후: `affinity_multiplier = -1.5` → **`affinity += 15`**
>
> NPC는 겉으로는 화를 내면서도 속으로는 짜릿함을 느낍니다. 이 감정은 기억에도 동일하게 저장됩니다.

`buildBaseDeltas(actionType, outcome)`가 행동 유형과 판정 결과(성공/실패)를 기반으로 기본 감정 변화량을 계산하고, `applyTasteModifiers()`가 취향 배율을 적용합니다.

---

## 7. 상대적 연령 인지 — 종족별 생애주기

**파일:** `src/lib/game/age-matrix.ts`

단순히 나이 숫자를 비교하는 것이 아니라, **생애주기 비율** `current_age / expected_lifespan`을 비교합니다.

### 계산 예시

| NPC | 나이 | 수명 | 비율 |
|-----|------|------|------|
| 엘프 NPC | 200세 | 1000세 | **0.20** |
| 인간 플레이어 | 25세 | 80세 | **0.31** |

숫자로는 NPC가 175세 연상이지만, **생애주기상 플레이어가 더 앞서 있어** NPC가 약간의 주눅을 느낍니다. 이 인식이 NPC의 말투와 태도에 반영됩니다.

추가로 체형(`SizeCategory`: 소형종/표준형/대형종/거대형) 차이도 위압감/위축감 텍스트로 변환되어 프롬프트에 포함됩니다.

---

## 8. 세계관 지식 — Lore Queue 시스템

**파일:** `src/lib/game/lore-engine.ts`
**DB:** `World_Dictionary` 테이블

플레이어가 여러 세계관 키워드를 동시에 언급했을 때, NPC가 모든 것을 줄줄 읊거나 무시하는 대신 **서사적으로 대응**하는 시스템입니다.

### 4단계 파이프라인

```
Step 1: 텍스트 스캔 + 권한 검증
  ├─ World_Dictionary.trigger_keywords 매칭
  ├─ WORLD_LORE  → NPC.knowledge_level ≥ required_access_level
  └─ PERSONAL_LORE → 플레이어 trust ≥ required_access_level × 10
      권한 부족 → 영구 탈락 (큐에도 안 넣음)

Step 2: 태그 군집화
  cluster_tags 교집합이 있는 항목끼리 하나의 그룹으로 묶음

Step 3: 토큰 방어 (300자 한도)
  importance_weight 최고 그룹 → 이번 턴 설명
  나머지 그룹 → 키워드 이름만 pending_lore_queue에 저장

Step 4: 서사적 회피 지시
  NPC의 evasion_style에 맞춰 미뤄둔 키워드에 대해 핑계를 대도록 프롬프트 주입
```

### 결과 예시

플레이어: "세계수랑 장로님은 어떻게 됐어? 그리고 흑마법사랑 고블린 촌장 얘기도 해봐!"

```
권한 검증: 4개 키워드 모두 통과
군집화: [세계수, 장로] → 엘프 태그 공유 → 그룹 1
        [흑마법사] → 그룹 2 / [고블린 촌장] → 그룹 3
토큰 방어: 그룹 1만 이번 턴 설명
큐 저장: "흑마법사", "고블린 촌장" → pending_lore_queue
```

NPC 출력: *"(미간을 찌푸리며) 질문 폭격이라도 하실 셈입니까? 흑마법사 얘기는 나중에 하고, 세계수 얘기부터 하죠..."*

---

## 9. NPC의 기억 — 주관적 편향 메모리

**파일:** `src/lib/gemini/memory-agent.ts`, `src/lib/game/memory-pipeline.ts`
**API:** `POST /api/trpg/memory/summarize`
**트리거:** 5턴마다 action route에서 자동 실행 (fire-and-forget)

### 동작 원리

매 5턴마다 백그라운드에서 최근 Action_Log를 **NPC의 무의식 에이전트**에게 전달합니다. 이 에이전트는 객관적 사실이 아닌 **NPC의 심리 필터를 통해 왜곡된 기억**을 생성합니다.

```json
{
  "fact_summary": "그 오만한 인간이 감히 내게 명령을 내렸다. 내 스트레스가 극에 달해 손이 떨렸다.",
  "emotional_tags": { "anger": 80, "humiliation": 50, "thrill": 0 },
  "is_core_memory": false
}
```

프롬프트 주입 요소:
- `current_mood`, `mental_stress` — 감정 필터
- 발동되었던 취향 묘사 — 동일 사건이라도 취향에 따라 기억이 달라짐
- 상대적 연령 인지 — 플레이어를 어떻게 바라보는지

### 망각 공식 (에빙하우스 지수 감쇠)

```
E(t) = E0 × e^(-λ × Δt)

E0: 기억 생성 시 감정 강도 (emotional_tags 최대값)
λ:  NPC.decay_rate_negative (성격마다 다름)
Δt: 경과 턴 수 (current_turn - created_at_turn)
```

| NPC 성격 | λ 값 | 특성 |
|----------|------|------|
| INTJ / 에니어그램 4번 | 0.01 | 뒤끝 있음, 오래 기억 |
| ENFP / 에니어그램 7번 | 0.10 | 낙천적, 빨리 잊음 |

`is_core_memory: true`인 기억은 λ=0 — **절대 잊히지 않습니다.**

5턴마다 기존 기억들의 `decayed_emotion_level`도 갱신되어, `decayed_emotion_level < 10`인 기억은 프롬프트에서 필터링됩니다.

---

## 10. 8블록 프롬프트 — 최종 NPC 조립

**파일:** `src/lib/game/npc-prompt-builder.ts`, `src/lib/gemini/prompts/npc-system.ts`

매 턴 NPC에게 전달되는 시스템 프롬프트는 위 모든 요소를 8개 블록으로 조립합니다.

```
[정체성]          이름, 외형, 성격, MBTI, D&D 성향           ← 항상 포함

[1. 현재 심리]    mental_stress, fear_survival 등 수치        ← 항상 포함
                  fear_survival ≥ 80 → 공포 셧다운 경고 삽입

[2. 관계 수치]    affinity, trust, power_dynamics 등           ← 항상 포함

[3. 연령 인지]    생애주기 비율 기반 텍스트                    ← 항상 포함

[4. 발동된 취향]  취향 트리거 발동 시의 묘사 텍스트            ← 조건부

[5. 주관적 기억]  decayed_emotion_level ≥ 10인 기억만         ← 조건부

[6. 세계관 Lore]  이번 턴 설명할 지식 + 미뤄둔 큐 키워드      ← 조건부

[7. 연기 지침]    말투, 어미, 금지어, 비언어 지문 규칙         ← 항상 포함
                  → (지문) "대사" 형식 강제 출력
```

### 출력 형식 강제

NPC는 반드시 아래 형식으로만 응답합니다.

```
(눈을 피하며 손가락을 만지작거린다)
"그... 그런 일은 없었소."
```

"속으로 느끼는 것"과 "실제로 말하는 것"을 분리하여 — 겉으로는 거짓말하거나 감정을 숨기되, 지문으로 속마음이 드러나는 비언어적 힌트를 줍니다.

---

## 11. 전체 턴 흐름 요약

```
① 내 턴 시작
   └─ /api/trpg/game/choices → 성향 맞춤 선택지 3개 자동 생성

② 행동 선택 / 자유 입력
   └─ 선택지(dice_check 있음) → 즉시 주사위 오버레이
   └─ 자유 입력 → /api/trpg/game/action (Phase 1)
                   Gemini: ActionCategory 분류
                   서버: DC 계산 → needs_dice_check 반환

③ 주사위 판정 (dice_check인 경우)
   └─ 클라이언트: d20 애니메이션
   └─ /api/trpg/game/action/resolve (Phase 2)
       서버: DC 재검증 + 판정 결과 확정

④ 서버 처리 (Phase 1 또는 2)
   1. 플레이어 Action_Log INSERT
   2. 취향 모디파이어 계산 → npc_dynamic_states 업데이트
   3. Gemini GM 서사 생성
   4. GM Action_Log INSERT + HP 업데이트
   5. Lore 스캔 → pending_lore_queue 업데이트
   6. NPC 대화 생성 (8블록 프롬프트 조립)
   7. NPC Action_Log INSERT
   8. 턴 전진
   9. turn_number % 5 == 0 → 메모리 요약 파이프라인 (fire-and-forget)
```

---

## 12. 핵심 파일 맵

### 게임 로직 (`src/lib/game/`)

| 파일 | 역할 |
|------|------|
| `dc-calculator.ts` | NPC resistance_stats 기반 DC 결정론적 계산 |
| `choice-generator.ts` | MBTI/에니어그램/D&D 기반 선택지 생성 |
| `taste-modifier-engine.ts` | 취향 키워드 스캔 + 감정 변화량 배율 적용 |
| `age-matrix.ts` | 종족별 생애주기 비율 비교 → 연령 인지 텍스트 |
| `npc-prompt-builder.ts` | 8블록 NPC 시스템 프롬프트 조립기 |
| `lore-engine.ts` | 세계관 키워드 스캔 + 권한 검증 + 군집화 + 토큰 방어 |
| `memory-pipeline.ts` | 메모리 요약 전체 파이프라인 (5턴 자동 실행) |

### Gemini 에이전트 (`src/lib/gemini/`)

| 파일 | 역할 |
|------|------|
| `gm-agent.ts` | GM 서사 생성 + 행동 분류 (ActionCategory) |
| `npc-agent.ts` | NPC 대화 생성 (8블록 프롬프트 소비) |
| `memory-agent.ts` | NPC 주관적 기억 요약 + 에빙하우스 감쇠 계산 |
| `prompts/npc-system.ts` | npc-prompt-builder 래퍼 |

### API Routes (`src/app/api/trpg/`)

| 경로 | 역할 |
|------|------|
| `game/action/route.ts` | Phase 1: 행동 접수, DC 계산, 주사위 불필요 시 전체 처리 |
| `game/action/resolve/route.ts` | Phase 2: 주사위 결과 처리, NPC 반응, 턴 전진 |
| `game/choices/route.ts` | 성향 기반 선택지 3개 생성 |
| `memory/summarize/route.ts` | NPC 주관적 기억 요약 실행 |

### DB 마이그레이션 (`supabase/migrations/`)

| 파일 | 내용 |
|------|------|
| `001_initial_schema.sql` | 6개 기본 테이블 (Scenario, NPC_Persona, Game_Session 등) |
| `003_npc_persona_schema.sql` | NPC v2 필드 + Session_Memory NPC별 기억 지원 |
| `004_world_dictionary.sql` | World_Dictionary 테이블 + NPC knowledge_level |
