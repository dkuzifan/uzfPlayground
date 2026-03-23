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
1. stat_schema: 이 시나리오에 적합한 스탯 2~5개를 결정하라. 시나리오 장르에 맞게 창의적으로 구성하라.
   - 판타지: hp(체력), attack(공격력), defense(방어력), speed(속도) 등
   - 미스터리: investigation(수사력), social(사회력), composure(침착도) 등 — HP 없어도 됨
   - 호러: sanity(정신력), stealth(은신), luck(운) 등
   - 스탯이 불필요한 시나리오라면 stat_schema를 빈 배열로 해도 됨
2. display 타입 선택:
   - "bar": 최대값이 있는 게이지(HP, 정신력 등). max_key도 반드시 설정
   - "counter": X/Y 형식으로 표시(기회 횟수 등). max_key 선택적
   - "number": 단순 수치 표시(공격력, 속도 등)
3. bar 타입 스탯은 max_key를 "{key}_max" 형식으로 설정하고, base_stats에도 max_key 값을 포함하라.
4. jobs: 위 직업 목록 각각에 대해 base_stats를 설계하라. stat_schema에 정의된 스탯 + bar 타입의 max_key 값 포함.
5. 직업 간 특성이 뚜렷하게 드러나야 한다. description은 1~2문장으로 직업 역할 설명.

JSON 형식으로만 응답하라:
{
  "character_config": {
    "stat_schema": [
      { "key": "hp", "label": "체력", "icon": "❤️", "display": "bar", "max_key": "hp_max", "color": "green" },
      { "key": "attack", "label": "공격력", "icon": "⚔️", "display": "number", "color": "neutral" }
    ],
    "jobs": [
      {
        "id": "warrior",
        "name": "전사",
        "description": "근접 전투에 특화된 강인한 전사.",
        "base_stats": { "hp": 120, "hp_max": 120, "attack": 15 }
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
