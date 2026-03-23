import { NextRequest, NextResponse } from "next/server";
import { getGeminiModel } from "@/lib/ai/gemini";

export interface LoreItemInput {
  domain: "WORLD_LORE" | "PERSONAL_LORE";
  category: string;
  lore_text: string;
  trigger_keywords: string[];
  cluster_tags: string[];
  importance_weight: number;
  required_access_level: number;
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
      ending_descriptions,
    } = body as {
      title?: string;
      theme?: string;
      description?: string;
      gm_system_prompt?: string;
      primary_objective?: string;
      secret_objective?: string;
      ending_descriptions?: string[];
    };

    if (!title || !theme) {
      return NextResponse.json({ error: "title과 theme은 필수입니다." }, { status: 400 });
    }

    const model = getGeminiModel("gemini-2.5-pro");

    const endingList = ending_descriptions?.length
      ? ending_descriptions.map((e, i) => `- 엔딩 ${i + 1}: ${e}`).join("\n")
      : "- (없음)";

    const prompt = `당신은 TRPG 세계관 설계 전문가입니다. 아래 시나리오 정보를 분석하여 World_Dictionary에 등록할 Lore 항목들을 설계하세요.

## 시나리오 정보
- 제목: ${title}
- 테마: ${theme}
- 설명: ${description ?? "(없음)"}
- GM 시스템 프롬프트 요약: ${gm_system_prompt ? gm_system_prompt.slice(0, 400) : "(없음)"}
- 메인 목표: ${primary_objective ?? "(없음)"}
- 숨겨진 목표: ${secret_objective ?? "(없음)"}
- 엔딩 구조:
${endingList}

## Lore 설계 원칙
1. 각 Lore는 150자 이내의 간결한 세계관 정보 조각이어야 한다
2. trigger_keywords는 플레이어가 능동적으로 조사할 때 사용할 구체적 단어 2~4개
3. WORLD_LORE: 누구나 조사하면 알 수 있는 세계관 상식 (장소, 역사, 사건)
4. PERSONAL_LORE: 특정 NPC만 알고 있는 비밀 정보 (개인사, 음모, 내부 사실)
5. 엔딩과 연결되는 복선을 포함하라 — 1막 복선이 3막에서 회수되도록
6. importance_weight: 1(사소한 분위기) ~ 10(엔딩 직결 핵심 단서)
7. required_access_level: 1(누구나) ~ 5(전문가) ~ 10(극비)

## category 예시
- 장소, 인물, 역사, 사건, 아이템, 조직, 음모, 비밀, 관계, 분위기

## 출력 형식 (JSON만, 코드블록 없이)
{
  "lore_items": [
    {
      "domain": "WORLD_LORE",
      "category": "장소",
      "lore_text": "...",
      "trigger_keywords": ["키워드1", "키워드2"],
      "cluster_tags": ["태그1", "태그2"],
      "importance_weight": 5,
      "required_access_level": 1
    }
  ]
}

규칙:
- 총 8~12개 항목 생성
- WORLD_LORE 60%, PERSONAL_LORE 40% 비율 권장
- 엔딩과 직결되는 핵심 단서는 importance_weight 8~10, required_access_level 3~5
- 분위기/배경 Lore는 importance_weight 3~5, required_access_level 1~2
- 모든 텍스트는 한국어
- JSON만 반환하고 코드블록(\`\`\`)이나 설명 없이 순수 JSON만 출력`.trim();

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned) as { lore_items: LoreItemInput[] };

    if (!Array.isArray(parsed.lore_items)) {
      throw new Error("lore_items 배열이 없습니다.");
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[generate-lore] failed:", err);
    return NextResponse.json({ error: "Lore 자동 생성에 실패했습니다." }, { status: 500 });
  }
}
