import { NextRequest, NextResponse } from "next/server";
import { getGeminiModel } from "@/lib/ai/gemini";

export interface LoreGapSuggestion {
  domain: "WORLD_LORE" | "PERSONAL_LORE";
  category: string;
  lore_text: string;
  trigger_keywords: string[];
  cluster_tags: string[];
  importance_weight: number;
  required_access_level: number;
  reason: string;
}

interface ExistingLoreSummary {
  category: string;
  lore_text: string;
  trigger_keywords: string[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const {
      title,
      theme,
      description,
      gm_system_prompt,
      primary_objective,
      secret_objective,
      endings,
      npc_names,
      existing_lore,
    } = body as {
      title?: string;
      theme?: string;
      description?: string;
      gm_system_prompt?: string;
      primary_objective?: string;
      secret_objective?: string;
      endings?: string[];
      npc_names?: string[];
      existing_lore?: ExistingLoreSummary[];
    };

    if (!title || !theme) {
      return NextResponse.json({ error: "title과 theme은 필수입니다." }, { status: 400 });
    }

    const model = getGeminiModel("gemini-2.5-pro");

    const existingLoreBlock = existing_lore?.length
      ? existing_lore.map((l, i) =>
          `${i + 1}. [${l.category}] "${l.lore_text.slice(0, 80)}..." (키워드: ${l.trigger_keywords.join(", ")})`
        ).join("\n")
      : "- (없음)";

    const endingBlock = endings?.length
      ? endings.map((e, i) => `- 엔딩 ${i + 1}: ${e}`).join("\n")
      : "- (없음)";

    const npcBlock = npc_names?.length
      ? npc_names.map((n) => `- ${n}`).join("\n")
      : "- (없음)";

    const prompt = `당신은 TRPG 시나리오 완성도 분석 전문가입니다.
아래 시나리오 정보와 현재 등록된 Lore 목록을 검토하여, 이 게임이 실제로 플레이될 때 플레이어들이 마주칠 상황을 예측하고 그 상황에 필요한데 현재 Lore에 없는 항목을 제안하세요.

## 시나리오 정보
- 제목: ${title}
- 테마: ${theme}
- 설명: ${description ?? "(없음)"}
- GM 지침 (일부): ${gm_system_prompt ? gm_system_prompt.slice(0, 400) : "(없음)"}
- 메인 목표: ${primary_objective ?? "(없음)"}
- 비밀 목표: ${secret_objective ?? "(없음)"}
- 엔딩 구조:
${endingBlock}
- 등장 NPC:
${npcBlock}

## 현재 등록된 Lore 목록
${existingLoreBlock}

## 분석 절차 (순서대로 수행)

### Step 1: 플레이 흐름 시뮬레이션
이 시나리오에서 플레이어들이 자주 취할 행동 유형을 목표·엔딩·NPC를 기반으로 추론한다.
- 어떤 장소를 탐색할 것인가?
- 어떤 NPC에게 어떤 질문을 할 것인가?
- 어떤 사건의 배경이나 역사를 조사할 것인가?
- 비밀 목표·엔딩 복선을 위해 어떤 단서가 필요한가?

### Step 2: Lore 커버리지 대조
Step 1에서 도출된 탐색 요소들이 현재 등록된 Lore로 커버되는지 확인한다.
- 예측된 핵심 키워드가 기존 trigger_keywords에 존재하는가?
- 엔딩 직결 복선이 Lore에 있는가?
- 등록 NPC가 답할 수 있는 PERSONAL_LORE가 충분한가?
※ 이미 커버된 항목은 절대 다시 제안하지 않는다.

### Step 3: 빈틈 항목 생성
커버되지 않는 항목 중 우선순위가 높은 것만 3~6개 선별하여 Lore 항목으로 생성한다.
- importance_weight 7 이상 (엔딩·목표 직결)을 최우선으로 제안한다.
- reason은 "어떤 상황에서 활성화되는지 + 없으면 어떤 문제가 생기는지"를 1~2문장으로 설명한다.

## 출력 형식 (JSON만, 코드블록 없이)
{
  "suggestions": [
    {
      "domain": "WORLD_LORE",
      "category": "역사",
      "lore_text": "...",
      "trigger_keywords": ["키워드1", "키워드2", "키워드3"],
      "cluster_tags": ["태그1", "태그2"],
      "importance_weight": 8,
      "required_access_level": 2,
      "reason": "메인 목표 달성 경로에서 플레이어가 반드시 조사하게 되는 배경이나, 현재 이에 해당하는 Lore가 없어 NPC가 일관된 답변을 제공할 수 없습니다."
    }
  ]
}

규칙:
- 제안은 3~6개로 제한
- 기존 Lore와 내용이 겹치는 항목은 절대 포함하지 말 것
- 모든 텍스트는 한국어
- lore_text는 150자 이내
- JSON만 반환 (코드블록 없이)`.trim();

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned) as { suggestions: LoreGapSuggestion[] };

    if (!Array.isArray(parsed.suggestions)) {
      throw new Error("suggestions 배열이 없습니다.");
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[analyze-lore-gaps] failed:", err);
    return NextResponse.json({ error: "Lore 분석에 실패했습니다." }, { status: 500 });
  }
}
