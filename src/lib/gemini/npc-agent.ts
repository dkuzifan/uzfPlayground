import { getGeminiModel } from "./client";
import { buildNpcSystemPrompt } from "./prompts/npc-system";
import type { NpcPersona, NpcMemory } from "@/lib/types/game";
import type { NpcDynamicState, SpeciesInfo } from "@/lib/types/character";
import type { LoreContext } from "@/lib/game/npc-prompt-builder";

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
