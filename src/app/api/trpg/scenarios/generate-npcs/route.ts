import { NextRequest, NextResponse } from "next/server";
import { getGeminiModel } from "@/lib/ai/gemini";
import type { NpcCustomTrigger } from "@/lib/trpg/types/game";

export interface NpcDraft {
  name: string;
  role: "ally" | "neutral" | "enemy" | "boss";
  custom_triggers?: NpcCustomTrigger[];
  appearance: string;
  personality: string;
  mbti: string;
  enneagram: number;
  dnd_alignment: string;
  hidden_motivation: { goal: string; secret: string };
  system_prompt: string;
  linguistic_profile: {
    speech_style: string;
    sentence_ending: string;
    honorific_rules: string;
    vocal_tics: string;
    evasion_style: string;
    forbidden_words: string[];
  };
  resistance_stats: {
    physical_defense: number;
    mental_willpower: number;
    perception: number;
  };
  knowledge_level: number;
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
    } = body as {
      title?: string;
      theme?: string;
      description?: string;
      gm_system_prompt?: string;
      primary_objective?: string;
      secret_objective?: string;
      endings?: string[];
    };

    if (!title || !theme) {
      return NextResponse.json({ error: "title과 theme은 필수입니다." }, { status: 400 });
    }

    const model = getGeminiModel("gemini-2.5-pro");

    const endingBlock = endings?.length
      ? endings.map((e, i) => `- 엔딩 ${i + 1}: ${e}`).join("\n")
      : "- (미설정)";

    const prompt = `당신은 TRPG 시나리오 디자이너입니다. 아래 시나리오에 등장할 NPC 2~4명을 설계하세요.

## 시나리오 정보
- 제목: ${title}
- 테마: ${theme}
- 설명: ${description ?? "(없음)"}
- GM 지침: ${gm_system_prompt ? gm_system_prompt.slice(0, 500) : "(없음)"}
- 메인 목표: ${primary_objective ?? "(없음)"}
- 비밀 목표: ${secret_objective ?? "(없음)"}
- 엔딩 구조:
${endingBlock}

## 설계 원칙
1. 시나리오 목표와 엔딩에 직접 연결되는 인물을 우선으로 설계한다.
2. role 구성: ally(우호적) 1명, neutral(중립) 1명, enemy(적대적) 또는 boss(주요 적) 1~2명.
3. 각 NPC는 플레이어가 마주쳤을 때 뚜렷한 인상을 남기는 개성이 있어야 한다.
4. hidden_motivation은 시나리오의 핵심 갈등 및 엔딩과 연결되어야 한다.
5. resistance_stats는 역할에 따라 차별화한다.
   - boss: physical_defense 16~20, mental_willpower 14~18, perception 12~16
   - enemy: physical_defense 12~16, mental_willpower 8~12, perception 10~14
   - ally: physical_defense 6~10, mental_willpower 12~16, perception 8~12
   - neutral: 각 항목 8~12 (균형)

## 출력 형식 (JSON 배열만, 코드블록 없이)
[
  {
    "name": "NPC 이름",
    "role": "ally | neutral | enemy | boss 중 하나",
    "appearance": "외형 묘사 (2~3문장)",
    "personality": "성격 묘사 (2~3문장)",
    "mbti": "MBTI 4자리 (예: INTJ)",
    "enneagram": 에니어그램 번호(1-9),
    "dnd_alignment": "lawful-good | neutral-good | chaotic-good | lawful-neutral | true-neutral | chaotic-neutral | lawful-evil | neutral-evil | chaotic-evil 중 하나",
    "hidden_motivation": {
      "goal": "이 NPC가 은밀히 추구하는 목표",
      "secret": "플레이어가 모르는 비밀"
    },
    "system_prompt": "이 NPC로 대화할 때 AI가 따를 역할 지시어 (3~5문장, 한국어)",
    "linguistic_profile": {
      "speech_style": "말투 설명",
      "sentence_ending": "자주 쓰는 어미 패턴 (없으면 빈 문자열)",
      "honorific_rules": "존댓말/하대 기준",
      "vocal_tics": "말버릇 (없으면 빈 문자열)",
      "evasion_style": "화제를 돌릴 때 방식",
      "forbidden_words": []
    },
    "resistance_stats": {
      "physical_defense": 10,
      "mental_willpower": 10,
      "perception": 10
    },
    "knowledge_level": 세계관 지식 수준(1-10)
  }
]

모든 텍스트는 한국어. JSON 배열만 반환 (코드블록 없이).`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) throw new Error("NPC 배열이 아닙니다.");

    return NextResponse.json({ npcs: parsed as NpcDraft[] });
  } catch (err) {
    console.error("[generate-npcs] failed:", err);
    return NextResponse.json({ error: "NPC 생성에 실패했습니다." }, { status: 500 });
  }
}
