import { getGeminiModel } from "./client";
import { buildNpcSystemPrompt } from "./prompts/npc-system";
import type { NpcPersona, NpcMemory } from "@/lib/types/game";
import type { NpcDynamicState, SpeciesInfo } from "@/lib/types/character";
import type { LoreContext } from "@/lib/game/npc-prompt-builder";

/**
 * 직접 언급되지 않은 NPC들이 해당 행동에 반응할지 판단합니다.
 * NPC의 가치관(D&D 성향, 에니어그램), 의무감, 스트레스 수준을 기반으로 평가.
 */
export async function evaluateBystanderReactions(
  actionContent: string,
  bystanders: Array<{ npc: NpcPersona; dynamicState: NpcDynamicState | null }>
): Promise<string[]> {
  if (bystanders.length === 0) return [];

  const model = getGeminiModel();

  const npcDescriptions = bystanders
    .map(({ npc, dynamicState }) => {
      const senseOfDuty = dynamicState?.sense_of_duty ?? 30;
      const stress = dynamicState?.mental_stress ?? 20;
      const mood = dynamicState?.current_mood ?? "평온";
      return `- ID: ${npc.id}
  이름: ${npc.name}
  성격: ${npc.personality ?? "알 수 없음"}
  D&D 성향: ${npc.dnd_alignment ?? "true-neutral"}
  에니어그램: ${npc.enneagram ?? 5}번
  현재 기분: ${mood}
  의무감: ${senseOfDuty}/100
  정신 스트레스: ${stress}/100`;
    })
    .join("\n");

  const prompt = `TRPG 세션에서 다음 행동이 발생했습니다.

행동: "${actionContent}"

아래 NPC들은 이 행동에 직접 언급되지 않았지만 근처에 있습니다.
각 NPC가 이 행동을 목격했을 때 반응(개입/발언/감정적 동요)을 보일지 판단하세요.

반응 기준:
1. 자신에게 직접 또는 간접적으로 영향이 미치는 경우
2. 자신의 가치관, 도덕관, 윤리관과 충돌하는 경우
3. 도저히 못 본 척할 수 없을 만큼 감정적으로 자극하는 경우

판단 시 고려사항:
- D&D 성향이 선(Good)에 가까울수록 비도덕적 행동에 민감하게 반응
- 의무감(sense_of_duty)이 높을수록 반응 역치 낮음 — 작은 자극에도 개입
- 정신 스트레스가 높을수록 예민하게 반응
- 에니어그램 1번(완벽주의자), 2번(조력자), 6번(충성가)은 반응 역치 낮음
- 에니어그램 5번(탐구자), 9번(평화주의자)은 반응 역치 높음
- 자신과 무관한 중립적 행동에는 반응하지 않음

NPC 목록:
${npcDescriptions}

JSON으로만 응답하세요:
{"reacting_npc_ids": ["npc_id_1", "npc_id_2"]}

반응할 NPC가 없으면: {"reacting_npc_ids": []}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
    const parsed = JSON.parse(result.response.text());
    return Array.isArray(parsed.reacting_npc_ids) ? parsed.reacting_npc_ids : [];
  } catch {
    console.error("[evaluateBystanderReactions] Gemini 호출 실패");
    return [];
  }
}

export interface NpcDialogueOptions {
  dynamicState?: NpcDynamicState;
  playerName?: string;
  playerSpeciesInfo?: SpeciesInfo;
  memories?: NpcMemory[];
  lore?: LoreContext;
}

export async function runNpcDialogue(
  npc: NpcPersona,
  conversationHistory: Array<{ role: "user" | "model"; content: string }>,
  playerMessage: string,
  options?: NpcDialogueOptions
): Promise<string> {
  const model = getGeminiModel();
  const systemPrompt = buildNpcSystemPrompt(npc, {
    dynamicState: options?.dynamicState,
    playerName: options?.playerName,
    playerSpeciesInfo: options?.playerSpeciesInfo,
    memories: options?.memories,
    lore: options?.lore,
  });

  const contents = [
    ...conversationHistory.map((h) => ({
      role: h.role,
      parts: [{ text: h.content }],
    })),
    { role: "user" as const, parts: [{ text: playerMessage }] },
  ];

  const result = await model.generateContent({
    systemInstruction: systemPrompt,
    contents,
  });

  return result.response.text();
}

export async function generateNpcProfile(
  role: string,
  scenarioContext: string
): Promise<Partial<NpcPersona>> {
  const model = getGeminiModel();

  const prompt = `
다음 TRPG 시나리오에서 "${role}" 역할의 NPC 프로필을 생성하세요.

시나리오 컨텍스트: ${scenarioContext}

다음 JSON 형식으로만 응답하세요:
{
  "name": "NPC 이름",
  "appearance": "외형 묘사",
  "personality": "성격 묘사",
  "mbti": "MBTI 4자리",
  "enneagram": 에니어그램 번호(1-9),
  "dnd_alignment": "성향",
  "hidden_motivation": { "goal": "숨겨진 목표", "secret": "비밀" },
  "system_prompt": "NPC 역할 지시어"
}
`.trim();

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
  });

  return JSON.parse(result.response.text());
}
