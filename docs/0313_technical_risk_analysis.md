# 기술 리스크 분석 리포트 (2026-03-13)

> 이슈 #1~#9 개선 작업 완료 후 복기한 잠재적 리스크 목록입니다.
> 각 항목은 **비개발자용 설명**과 **기술적 상세**를 함께 포함합니다.

---

## 목차

| 우선순위 | 항목 | 관련 이슈 |
|----------|------|-----------|
| 🔴 높음 | [GM 프롬프트 복잡도 증가](#1-gm-프롬프트-복잡도-증가) | #7 |
| 🟡 중간 | [매 행동마다 추가 AI 호출](#2-매-행동마다-추가-ai-호출) | #2 |
| 🟡 중간 | [DC 계산 로직의 분산](#3-dc-계산-로직의-분산) | #4, #7 |
| 🟢 낮음 | [세션 요약 조회 에러 무시](#4-세션-요약-조회-에러-무시) | #8 |
| 🟢 낮음 | [턴 시작 시 토스트 누락](#5-턴-시작-시-토스트-누락) | #9 |
| 🟢 낮음 | [구버전 선택지의 카테고리 누락](#6-구버전-선택지의-카테고리-누락) | #6 |

---

## 1. GM 프롬프트 복잡도 증가

**우선순위: 🔴 높음 — 실제 플레이로 검증 필요**

### 비개발자용 설명

GM(게임 마스터)은 AI입니다. AI에게 일을 시키려면 "무엇을 해달라"는 지시문(프롬프트)을 전달합니다.

이전에는 GM에게 두 가지를 요청했습니다:
1. 지금 상황을 서사로 묘사해줘
2. HP 변화가 있으면 알려줘

개선 작업 이후, 여기에 한 가지가 추가됐습니다:
3. **다음 행동 선택지 3개도 함께 만들어줘**

문제는 사람도 마찬가지지만, AI도 해야 할 일이 많아질수록 각 항목에 집중하는 능력이 분산됩니다. 지시문이 길어질수록 AI가 일부 규칙을 놓치거나, 전체적인 서사 품질이 낮아지는 현상이 발생할 수 있습니다.

### 기술적 상세

- **변경 내용**: `buildSystemInstruction()`에 `next_choices` 생성 규칙 및 응답 스키마가 추가됨. 응답 JSON 구조도 `narration + state_changes` → `narration + state_changes + next_choices`로 확장됨.
- **리스크 시나리오 1**: Gemini가 `next_choices`를 빈 배열 또는 누락으로 반환 → fallback `fetchChoices()` 호출로 보완되나 추가 지연(2~5초) 발생
- **리스크 시나리오 2**: `dice_check.dc`를 0이 아닌 임의의 값으로 반환 → DC 오버라이드 로직이 덮어쓰므로 실제 판정에는 영향 없음
- **리스크 시나리오 3**: 복잡한 프롬프트로 인해 narration 길이 단축, 문체 단순화, 세계관 일관성 저하 가능 → 보완책 없음, 모니터링 필요

### 현재 보완책

- `next_choices`가 비었을 경우 기존 `/api/trpg/game/choices` API fallback 호출
- `is_fallback` 플래그 + 클라이언트 토스트 알림

### 권장 조치

실제 플레이 세션을 진행하면서 narration 품질을 직접 확인. 품질 저하가 명확하다면 **GM과 선택지 생성을 다시 분리**하는 방향으로 롤백 검토.

---

## 2. 매 행동마다 추가 AI 호출

**우선순위: 🟡 중간 — 지연 + 실패 시 반응 누락**

### 비개발자용 설명

NPC(비플레이어 캐릭터)의 반응을 더 현실적으로 만들기 위해, 플레이어의 행동이 근처에 있는 다른 NPC에게도 영향을 줄 수 있도록 했습니다.

예를 들어, 플레이어가 시장에서 상인을 위협했을 때 옆에 있던 경비병이 반응하는 식입니다.

이를 위해 AI에게 "이 행동을 보고 반응할 NPC가 있는가?"를 매 행동마다 추가로 물어봅니다. AI 호출은 시간이 걸리고, 실패할 수도 있습니다.

### 기술적 상세

- **변경 내용**: `determineTargetedNpcs()`(동기, 텍스트 매칭) → `determineReactingNpcs()`(비동기, Gemini 기반 바이스탠더 평가)로 교체
- **추가 Gemini 호출**: 매 행동마다 `evaluateBystanderReactions()` 1회 추가
- **리스크 시나리오 1**: Gemini 호출 실패 → `console.error` 후 빈 배열 반환 → 바이스탠더 NPC 반응 없음. 플레이어는 이유를 알 수 없음.
- **리스크 시나리오 2**: 바이스탠더 평가 응답 지연으로 전체 행동 처리 시간 증가. 응답이 오기 전까지 이후 로직이 블로킹됨.
- **호출 횟수 현황**: NPC 없을 때 기존 2회 → 현재 2회(바이스탠더 평가 + GM), NPC 1명일 때 기존 3회 → 현재 3회(바이스탠더 평가 + GM + NPC 대화)

### 현재 보완책

- `evaluateBystanderReactions()` catch에 `console.error` 추가됨
- 실패 시 빈 배열 반환으로 전체 플로우 중단 방지

### 권장 조치

실제 응답 시간 모니터링. 체감 지연이 크다면 바이스탠더 평가를 **fire-and-forget**으로 전환(메인 플로우와 분리)하거나, NPC 수가 1명 이하일 때는 평가를 생략하는 최적화 검토.

---

## 3. DC 계산 로직의 분산

**우선순위: 🟡 중간 — 유지보수 시 불일치 위험**

### 비개발자용 설명

TRPG에서 DC(Difficulty Class, 난이도)는 주사위를 굴려서 넘어야 하는 기준 숫자입니다. 예를 들어 DC 15라면 주사위+보너스가 15 이상이어야 성공합니다.

이 DC는 NPC의 특성(저항력, 의지력 등)을 기반으로 계산됩니다. 지금은 이 계산 코드가 세 군데에 복사되어 있습니다:

1. 선택지를 만들 때 (choices/route.ts)
2. 판정 없는 행동 처리 때 (action/route.ts)
3. 주사위 판정 처리 때 (resolve/route.ts)

마치 같은 레시피를 세 군데에 따로 적어둔 것입니다. 레시피를 수정할 때 세 곳을 모두 똑같이 바꿔야 합니다. 한 곳만 바꾸면 서로 다른 결과가 나옵니다.

### 기술적 상세

```typescript
// 이 코드가 3개 파일에 각각 존재함
const resistance = primaryNpc?.resistance_stats ?? defaultResistanceStats();
const realDc = category
  ? (computeDCFromCategory(category, resistance) ?? defaultResistanceStats().mental_willpower)
  : defaultResistanceStats().mental_willpower;
```

- **리스크**: DC 계산 방식 변경 시(예: 새 저항 스탯 추가) 3개 파일을 모두 수정해야 함. 하나라도 누락 시 선택지에 표시되는 DC와 실제 판정 DC가 달라지는 이슈 재발
- **발생 가능성**: 낮음(지금은 로직이 동일), 나중에 DC 시스템 확장 시 높아짐

### 현재 보완책

없음. 현재는 세 곳의 코드가 동일하므로 실제 불일치는 없음.

### 권장 조치

DC 오버라이드 로직을 `src/lib/game/dc-calculator.ts`의 공유 함수로 추출:

```typescript
// 예시
export function applyDcOverride(choices: ActionChoice[], npc: NpcPersona | null): ActionChoice[]
```

세 파일이 동일 함수를 호출하도록 리팩토링. 현재는 우선순위가 낮으므로 DC 시스템 변경이 필요할 때 함께 처리 권장.

---

## 4. 세션 요약 조회 에러 무시

**우선순위: 🟢 낮음 — 기능상 무해, 로그 부재**

### 비개발자용 설명

게임이 진행되면 AI가 5턴마다 지금까지의 내용을 요약해서 저장합니다. GM은 이 요약을 참고해서 과거 사건을 기억하고 서사에 반영합니다.

그런데 게임을 시작한 직후(5턴 이전)에는 아직 요약본이 없습니다. 요약본을 조회했는데 없으면 데이터베이스가 "없다"는 신호를 보냅니다. 지금 코드는 이 신호를 에러로 간주하지 않고 조용히 무시합니다.

기능상으로는 문제가 없습니다("요약 없음" = "아직 초반이라 요약할 것이 없음"으로 처리). 하지만 이 에러 신호가 로그에 남지 않기 때문에, 나중에 다른 이유로 조회가 실패하더라도 알아채기 어렵습니다.

### 기술적 상세

```typescript
// Promise.all 내부
supabase
  .from("Session_Memory")
  .select("summary_text, key_facts, last_summarized_turn")
  .eq("session_id", session_id)
  .is("npc_id", null)
  .order("last_summarized_turn", { ascending: false })
  .limit(1)
  .single(),  // 행이 없으면 { data: null, error: PGRST116 }

// 에러를 구조분해에서 무시
const [... { data: globalMemoryData }] = await Promise.all([...]);
```

- Supabase v2에서 `.single()`은 행이 없을 때 reject하지 않고 `{ data: null, error: { code: 'PGRST116' } }`를 반환
- `data: null`이므로 `sessionSummary = undefined`로 처리되어 GM 컨텍스트에서 섹션이 생략됨 → 기능상 정상
- 단, `error`를 확인하지 않아 다른 종류의 에러(권한 문제, 네트워크 오류 등)도 동일하게 무시됨

### 현재 보완책

`null` 체크로 `undefined` 처리. 기능 중단 없음.

### 권장 조치

에러 구조분해를 추가하고 예상치 못한 에러 코드만 로깅:

```typescript
const [... { data: globalMemoryData, error: globalMemoryError }] = await Promise.all([...]);
if (globalMemoryError && globalMemoryError.code !== 'PGRST116') {
  console.error("[ActionRoute] Session_Memory 조회 실패:", globalMemoryError);
}
```

---

## 5. 턴 시작 시 토스트 누락

**우선순위: 🟢 낮음 — UX 일관성 부족**

### 비개발자용 설명

게임에서 오류가 발생할 때 화면 우측 하단에 알림(토스트)이 나타나도록 했습니다. 그런데 한 가지 경우에는 알림이 뜨지 않습니다.

플레이어의 턴이 시작될 때 선택지가 자동으로 생성되는데, 이 과정에서 AI 오류로 기본 선택지가 표시되어도 알림이 뜨지 않습니다.

다른 경우(행동 제출 후, 주사위 결과 후)에는 알림이 뜨는데 이 경우만 누락되어 있어 일관성이 부족합니다.

### 기술적 상세

```typescript
// useGameScreen.ts - 턴 시작 시 fetchChoices 호출
useEffect(() => {
  if (isMyTurn && !prevIsMyTurnRef.current && myPlayer && localId) {
    fetchChoices(sessionId, myPlayer.id, localId);
    // ↑ 반환값(is_fallback)을 무시함 → 폴백 시 토스트 없음
  }
  prevIsMyTurnRef.current = isMyTurn;
}, [isMyTurn, myPlayer, localId, sessionId, fetchChoices]);
```

- `fetchChoices`는 이제 `Promise<{ is_fallback?: boolean } | undefined>`를 반환하지만, `useEffect` 내 호출부는 반환값을 사용하지 않음
- 행동 제출 후 fetchChoices 호출부는 `is_fallback`을 확인하고 토스트를 띄움 → 불일치

### 현재 보완책

없음. 기능 자체는 정상(폴백 선택지는 표시됨).

### 권장 조치

```typescript
useEffect(() => {
  if (isMyTurn && !prevIsMyTurnRef.current && myPlayer && localId) {
    fetchChoices(sessionId, myPlayer.id, localId).then((result) => {
      if (result?.is_fallback) {
        toast.info("선택지 생성에 오류가 발생했습니다. 기본 선택지로 진행합니다.");
      }
    });
  }
  prevIsMyTurnRef.current = isMyTurn;
}, [isMyTurn, myPlayer, localId, sessionId, fetchChoices]);
```

---

## 6. 구버전 선택지의 카테고리 누락

**우선순위: 🟢 낮음 — 기존 동작과 동일, 점진적 해소**

### 비개발자용 설명

이번 개선에서 선택지에 "이 행동이 어떤 종류인가"라는 정보(카테고리)를 추가했습니다. 예를 들어 "선물을 건넨다"는 `gift`, "공격한다"는 `attack`으로 분류됩니다.

그런데 게임이 이미 진행 중인 경우, AI가 이전 방식으로 만들어둔 선택지(카테고리 없음)가 캐시에 남아있을 수 있습니다. 플레이어가 그 선택지를 클릭하면 카테고리 정보가 없어서 "기타/중립" 행동으로 처리됩니다.

이것은 개선 이전의 동작과 동일합니다. 새로 생성되는 선택지부터는 자동으로 해결됩니다.

### 기술적 상세

```typescript
// action/route.ts
let effectiveCategory: string = bodyActionCategory ?? "none";
// bodyActionCategory가 undefined면 "none" → buildBaseDeltas("neutral", null) → 델타 전부 0
```

- `ActionChoice`에 `action_category` 필드가 추가되었으나 기존 Gemini 캐시나 이전 응답에서 생성된 선택지는 해당 필드 없음
- `dice_check`가 없는 선택지(`gift`, `none` 카테고리)는 이전에도 NPC 감정 변화가 없었으므로 회귀 없음
- `dice_check`가 있는 선택지는 resolve 플로우에서 별도 처리되므로 영향 없음

### 현재 보완책

`?? "none"` 기본값으로 안전하게 처리됨. 새로 생성되는 선택지부터는 `action_category`가 포함됨.

### 권장 조치

별도 조치 불필요. 자연스럽게 해소됨.

---

## 종합 요약

| 항목 | 우선순위 | 당장 조치 필요 | 권장 시점 |
|------|----------|----------------|-----------|
| GM 프롬프트 복잡도 | 🔴 | 플레이 검증 필요 | 즉시 모니터링 |
| 추가 AI 호출 | 🟡 | 아니오 | 지연 체감 시 |
| DC 로직 분산 | 🟡 | 아니오 | DC 시스템 변경 시 |
| 세션 요약 에러 무시 | 🟢 | 아니오 | 다음 리팩토링 시 |
| 턴 시작 토스트 누락 | 🟢 | 아니오 | 다음 UX 작업 시 |
| 구버전 선택지 카테고리 | 🟢 | 아니오 | 자동 해소 |

> 가장 먼저 확인해야 할 것은 **실제 플레이에서 GM 서사 품질**입니다.
> narration이 짧아지거나 맥락이 끊기는 느낌이 든다면 #7 이슈(GM + 선택지 통합)를 분리 검토해야 합니다.
