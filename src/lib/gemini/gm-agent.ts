import { getGeminiModel } from "./client";
import { GM_SYSTEM_PROMPT } from "./prompts/gm-system";
import type { ActionLog, GmResponse, SessionMemory } from "@/lib/types/game";
import type { PlayerCharacter } from "@/lib/types/character";

interface GmActionInput {
  memory: SessionMemory | null;
  recentLogs: ActionLog[];
  actingPlayer: PlayerCharacter;
  action: string;
  actionType: "choice" | "free_input";
}

export async function runGmAction(input: GmActionInput): Promise<GmResponse> {
  const model = getGeminiModel();

  const context = buildContext(input);

  const result = await model.generateContent({
    systemInstruction: GM_SYSTEM_PROMPT,
    contents: [{ role: "user", parts: [{ text: context }] }],
    generationConfig: { responseMimeType: "application/json" },
  });

  const text = result.response.text();
  return JSON.parse(text) as GmResponse;
}

function buildContext(input: GmActionInput): string {
  const { memory, recentLogs, actingPlayer, action } = input;

  const memorySummary = memory
    ? `## 이전 스토리 요약\n${memory.summary_text}\n`
    : "";

  const recentHistory = recentLogs
    .map((log) => `[${log.speaker_name}]: ${log.content}`)
    .join("\n");

  const playerInfo = `
## 행동하는 캐릭터
- 이름: ${actingPlayer.character_name}
- 직업: ${actingPlayer.job}
- HP: ${actingPlayer.stats.hp}/${actingPlayer.stats.max_hp}
- 성향: ${actingPlayer.personality.dnd_alignment ?? "알 수 없음"} (${actingPlayer.personality.mbti ?? ""})
`.trim();

  return `
${memorySummary}
## 최근 행동 기록
${recentHistory}

${playerInfo}

## 현재 행동
[${actingPlayer.character_name}]: ${action}

위 행동을 판정하고 결과를 JSON으로 반환하십시오.
`.trim();
}
