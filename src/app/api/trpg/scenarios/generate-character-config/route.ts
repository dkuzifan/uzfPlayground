import { NextRequest, NextResponse } from "next/server";
import { getGeminiModel } from "@/lib/gemini/client";
import type { CharacterConfig } from "@/lib/types/game";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { title, theme, description, gm_system_prompt, job_labels } = body as {
      title?: string;
      theme?: string;
      description?: string;
      gm_system_prompt?: string;
      job_labels?: Record<string, string>;
    };

    if (!title || !theme) {
      return NextResponse.json({ error: "title과 theme은 필수입니다." }, { status: 400 });
    }

    const model = getGeminiModel();

    const jobList = job_labels
      ? Object.entries(job_labels).map(([id, name]) => `- id: "${id}", 이름: "${name}"`).join("\n")
      : "- 직업 목록 없음 (기본값 사용)";

    const prompt = `당신은 TRPG 시나리오 설계자입니다. 아래 시나리오에 맞는 캐릭터 스탯 시스템을 설계하세요.

## 시나리오 정보
- 제목: ${title}
- 테마: ${theme}
- 설명: ${description ?? "(없음)"}
- GM 프롬프트 요약: ${gm_system_prompt ? gm_system_prompt.slice(0, 300) : "(없음)"}

## 등록된 직업 목록
${jobList}

## 요구사항
1. stat_schema: 이 시나리오에 적합한 스탯 3~5개를 결정하라. "hp"는 반드시 포함. 테마에 맞게 창의적으로 구성 가능 (예: 판타지=마력, SF=해킹, 호러=정신력).
2. jobs: 위 직업 목록 각각에 대해 base_stats를 설계하라. stat_schema에 정의된 스탯만 포함. hp는 60~150 범위, 나머지 스탯은 5~25 범위.
3. 직업 간 스탯 합계는 비슷하게 유지하되, 각 직업의 특성이 드러나야 한다.
4. description은 1~2문장으로 그 직업의 역할을 설명.

JSON 형식으로만 응답하라:
{
  "character_config": {
    "stat_schema": ["hp", "attack", "defense", "speed"],
    "jobs": [
      {
        "id": "warrior",
        "name": "전사",
        "description": "근접 전투에 특화된 강인한 전사.",
        "base_stats": { "hp": 120, "attack": 15, "defense": 12, "speed": 8 }
      }
    ]
  }
}`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });

    const parsed = JSON.parse(result.response.text()) as { character_config: CharacterConfig };
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[generate-character-config] failed:", err);
    return NextResponse.json({ error: "AI 생성에 실패했습니다." }, { status: 500 });
  }
}
