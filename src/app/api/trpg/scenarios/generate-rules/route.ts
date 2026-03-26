import { NextRequest, NextResponse } from "next/server";
import { getGeminiModel } from "@/lib/ai/gemini";
import type { ResourceRule } from "@/lib/trpg/types/game";

export interface GeneratedRules {
  info_rules: {
    private_items: boolean;
    private_lore: boolean;
    reason: string;
  };
  resource_rules: Array<
    ResourceRule & { reason: string }
  >;
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
      stat_schema,
    } = body as {
      title?: string;
      theme?: string;
      description?: string;
      gm_system_prompt?: string;
      primary_objective?: string;
      stat_schema?: Array<{ key: string; label: string; icon?: string }>;
    };

    if (!title || !theme) {
      return NextResponse.json({ error: "title과 theme은 필수입니다." }, { status: 400 });
    }

    const model = getGeminiModel("gemini-2.5-pro");

    const statList = stat_schema?.length
      ? stat_schema.map((s) => `- ${s.key} (${s.label}${s.icon ? ` ${s.icon}` : ""})`).join("\n")
      : "- hp (체력)\n- attack (공격력)\n- defense (방어력)";

    const prompt = `당신은 TRPG 게임 디자이너입니다. 아래 시나리오 정보를 분석하여 가장 적합한 게임 룰을 제안하세요.

## 시나리오 정보
- 제목: ${title}
- 테마: ${theme}
- 설명: ${description ?? "(없음)"}
- GM 지침 (일부): ${gm_system_prompt ? gm_system_prompt.slice(0, 300) : "(없음)"}
- 메인 목표: ${primary_objective ?? "(없음)"}

## 현재 스탯 목록
${statList}

## 제안 원칙
1. 시나리오 테마와 분위기에 딱 맞는 룰만 제안한다.
2. 비공개 정보(info_rules): 아이템(private_items)과 Lore(private_lore)를 독립적으로 판단한다.
   - private_items: 아이템 획득·보유를 다른 플레이어에게 숨겨야 하면 true (경쟁·추리 구조).
   - private_lore: 발견한 단서·배경지식을 다른 플레이어에게 숨겨야 하면 true (추리·서스펜스 구조).
   - 협력·탐험·액션 중심이면 둘 다 false.
3. 특수 자원(resource_rules): 테마에 핵심적인 자원만 1~3개 제안. 단순 HP 변동은 제외.
   - 이미 존재하는 스탯(위 목록)을 활용하거나, 새로운 stat_key를 제안할 수 있다.
   - stat_key가 새것이면 캐릭터 생성 시 해당 스탯이 자동으로 추가된다고 가정한다.
4. change_conditions는 구체적이고 명확한 트리거 설명으로 1~3개 작성한다.
5. 각 제안에 reason(짧은 이유)을 반드시 붙인다.

JSON 형식으로만 응답하세요:
{
  "info_rules": {
    "private_items": false,
    "private_lore": true,
    "reason": "단서(Lore)는 개인 비공개가 추리 긴장감을 높이지만, 아이템은 협력 공유가 더 적합"
  },
  "resource_rules": [
    {
      "stat_key": "sanity",
      "change_conditions": [
        { "trigger": "끔찍한 장면이나 시체 목격", "delta": -15 },
        { "trigger": "동료와 협력하여 공포 극복", "delta": 10 }
      ],
      "depletion_effect": "패닉 상태 — 이성적 판단 불가, 무작위 행동",
      "reason": "호러 장르 핵심 자원. 공포 누적과 회복의 긴장감을 만든다."
    }
  ]
}`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });

    const parsed = JSON.parse(result.response.text()) as GeneratedRules;

    return NextResponse.json({ rules: parsed });
  } catch (err) {
    console.error("[generate-rules]", err);
    return NextResponse.json({ error: "룰 생성에 실패했습니다." }, { status: 500 });
  }
}
