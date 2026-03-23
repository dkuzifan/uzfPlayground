import { NextRequest, NextResponse } from "next/server";
import { getGeminiModel } from "@/lib/ai/gemini";
import type { ScenarioObjectives, ScenarioEndings } from "@/lib/trpg/types/game";

// ── POST /api/trpg/scenarios/generate-objectives ──────────────────────────
// 시나리오 설정을 받아 Gemini로 목표(ScenarioObjectives)와
// 엔딩 조건(ScenarioEndings)을 자동 생성한다.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, theme, description, gm_system_prompt, npc_names } = body as {
    title?: string;
    theme?: string;
    description?: string;
    gm_system_prompt?: string;
    npc_names?: string[];
  };

  if (!title || !theme) {
    return NextResponse.json({ error: "title, theme은 필수입니다." }, { status: 400 });
  }

  const npcList = (npc_names ?? []).join(", ") || "없음";

  const prompt = `
당신은 TRPG 시나리오 디자이너입니다.
아래 시나리오 정보를 바탕으로 게임 목표와 엔딩 조건을 JSON으로 설계하세요.

## 시나리오 정보
- 제목: ${title}
- 테마: ${theme}
- 설명: ${description ?? "없음"}
- GM 설정: ${gm_system_prompt ?? "없음"}
- 등장 NPC: ${npcList}

## 출력 형식 (JSON만 출력, 주석 없음)
{
  "objectives": {
    "primary": {
      "type": "<eliminate|reach|find|obtain|protect|survive|solve|reveal|escort|choose>",
      "target_description": "<메인 목표 한 문장>",
      "progress_max": <4 또는 6>
    },
    "secondary": [
      {
        "type": "<위와 동일한 유형 중 하나>",
        "target_description": "<서브 목표 한 문장>",
        "progress_max": <4 또는 6>
      }
    ],
    "secret": {
      "type": "<유형>",
      "target_description": "<숨겨진 목표 (플레이어에게 공개되지 않음)>",
      "progress_max": 4,
      "is_hidden": true
    },
    "doom_clock_interval": <3~5 사이 정수>,
    "doom_clock_max": <6~10 사이 정수>
  },
  "endings": {
    "endings": [
      {
        "id": "full_victory",
        "label": "<완전한 승리 등>",
        "description": "<결말 설명 2~3문장>",
        "trigger": "primary_complete",
        "tone": "<triumphant|bittersweet|tragic|mysterious>"
      },
      {
        "id": "doom_end",
        "label": "<실패 엔딩 레이블>",
        "description": "<실패 결말 설명>",
        "trigger": "doom_maxed",
        "tone": "tragic"
      },
      {
        "id": "secret_end",
        "label": "<비밀 엔딩 레이블>",
        "description": "<비밀 엔딩 결말 설명>",
        "trigger": "secret_complete",
        "tone": "mysterious"
      }
    ]
  }
}

규칙:
- secondary는 1~2개 권장 (0개도 가능)
- secret은 반드시 포함
- endings는 최소 2개, 권장 3개
- 모든 텍스트는 한국어로 작성
- JSON만 출력하고, 코드블록(\`\`\`)이나 설명 없이 JSON만 반환
`.trim();

  try {
    const model = getGeminiModel("gemini-2.5-pro");
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();

    // JSON 파싱 (코드블록 제거)
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned) as {
      objectives: ScenarioObjectives;
      endings: ScenarioEndings;
    };

    if (!parsed.objectives?.primary || !parsed.endings?.endings?.length) {
      throw new Error("Gemini 응답 구조가 올바르지 않습니다.");
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[generate-objectives] Gemini 오류:", err);
    return NextResponse.json(
      { error: "목표 자동 생성에 실패했습니다. 수동으로 입력해주세요." },
      { status: 500 }
    );
  }
}
