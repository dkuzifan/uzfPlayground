import { getGeminiModel } from "@/lib/gemini/client";
import type { ActionChoice } from "@/lib/types/game";

const AVATAR_STYLE: Record<number, string> = {
  0: "공격적이고 대담한 행동을 선호",
  1: "모험적이고 위험을 감수하는 행동을 선호",
  2: "호기심 많고 탐색적인 행동을 선호",
  3: "신중하고 전술적인 행동을 선호",
  4: "사교적이고 외교적인 접근을 선호",
  5: "분석적이고 신중하게 상황을 파악하는 행동을 선호",
  6: "신비롭고 마법적 해결책을 찾는 행동을 선호",
  7: "창의적이고 예상치 못한 행동을 선호",
};

export function parseAvatarStyle(personalitySummary: string | null): string {
  const match = personalitySummary?.match(/avatar:(\d)/);
  const idx = match ? parseInt(match[1]) : 0;
  return AVATAR_STYLE[idx] ?? AVATAR_STYLE[0];
}

export async function generateChoices(
  personalitySummary: string | null,
  currentSituation: string,
  characterName: string
): Promise<ActionChoice[]> {
  const model = getGeminiModel();
  const style = parseAvatarStyle(personalitySummary);

  const prompt = `
캐릭터 "${characterName}"의 행동 성향: ${style}

현재 상황:
${currentSituation}

이 캐릭터의 성향에 맞는 행동 선택지 3개를 생성하세요.
각 선택지는 서로 다른 접근 방식을 나타내야 합니다.

JSON 배열로만 응답하세요:
[
  { "id": "choice_1", "label": "선택지 짧은 제목", "description": "행동 상세 설명", "action_type": "choice" },
  { "id": "choice_2", "label": "선택지 짧은 제목", "description": "행동 상세 설명", "action_type": "choice" },
  { "id": "choice_3", "label": "선택지 짧은 제목", "description": "행동 상세 설명", "action_type": "choice" }
]
`.trim();

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
  });

  return JSON.parse(result.response.text()) as ActionChoice[];
}
