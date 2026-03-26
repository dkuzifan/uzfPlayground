import { NextRequest, NextResponse } from "next/server";
import { getGeminiModel } from "@/lib/ai/gemini";
import type { StatSchemaEntry } from "@/lib/trpg/types/character";

interface JobInput {
  id: string;
  name: string;
  description: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { stat_schema, jobs, theme } = body as {
      stat_schema?: StatSchemaEntry[];
      jobs?: JobInput[];
      theme?: string;
    };

    if (!stat_schema?.length || !jobs?.length) {
      return NextResponse.json({ error: "stat_schema와 jobs는 필수입니다." }, { status: 400 });
    }

    const model = getGeminiModel("gemini-2.5-pro");

    // 스탯 목록 설명 생성
    const statLines = stat_schema.map((s) => {
      const maxNote = s.max_key ? ` (최대값 키: ${s.max_key})` : "";
      return `- ${s.key} (${s.label}${s.icon ? ` ${s.icon}` : ""}, 표시: ${s.display}${maxNote})`;
    }).join("\n");

    // 직업 목록 설명
    const jobLines = jobs.map((j) => (
      `- id: "${j.id}", 이름: "${j.name}", 특성: ${j.description || "(없음)"}`
    )).join("\n");

    // bar 타입 스탯의 max_key 목록
    const barStats = stat_schema.filter((s) => s.display === "bar" && s.max_key);

    const prompt = `당신은 TRPG 게임 디자이너입니다. 아래 직업 설명을 읽고 각 직업에 맞는 초기 스탯 수치를 설계하세요.

## 시나리오 테마
${theme ?? "판타지"}

## 스탯 목록
${statLines}

## 직업 목록과 특성
${jobLines}

## 설계 원칙
1. 각 직업의 특성 설명에 맞게 스탯을 차별화하라. 모든 직업이 같은 수치면 안 된다.
2. bar/counter 타입 스탯 (HP, 정신력 등): 80~150 범위 권장.
   bar 타입이면 max_key에도 같은 값을 반드시 포함하라.
3. number 타입 스탯 (공격력, 속도 등): 5~20 범위 권장.
4. 직업 간 총합이 비슷하게 유지되되, 강점/약점이 뚜렷하게 드러나야 한다.
5. description이 없는 직업은 직업명으로 유추해서 채워라.

JSON 형식으로만 응답하라:
{
  "jobs": [
    {
      "id": "warrior",
      "base_stats": { "hp": 130, "hp_max": 130, "attack": 15, "defense": 12, "speed": 6 }
    },
    {
      "id": "mage",
      "base_stats": { "hp": 80, "hp_max": 80, "attack": 18, "defense": 6, "speed": 10 }
    }
  ]
}

반드시 입력된 모든 직업(id 기준)에 대해 base_stats를 반환하라.
반드시 모든 스탯 키(${stat_schema.map((s) => s.key).join(", ")}${barStats.length ? ", " + barStats.map((s) => s.max_key).join(", ") : ""})를 포함하라.`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });

    const parsed = JSON.parse(result.response.text()) as {
      jobs: Array<{ id: string; base_stats: Record<string, number> }>;
    };

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[generate-job-stats] failed:", err);
    return NextResponse.json({ error: "AI 생성에 실패했습니다." }, { status: 500 });
  }
}
