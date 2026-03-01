import { getGeminiModel } from "@/lib/gemini/client";
import type { ActionChoice } from "@/lib/types/game";
import type { PersonalityProfile } from "@/lib/types/character";

export async function generateChoices(
  personality: PersonalityProfile,
  currentSituation: string,
  characterName: string
): Promise<ActionChoice[]> {
  const model = getGeminiModel();

  const prompt = `
캐릭터 "${characterName}"의 성향:
- MBTI: ${personality.mbti ?? "알 수 없음"}
- 에니어그램: ${personality.enneagram ?? "알 수 없음"}번
- D&D 성향: ${personality.dnd_alignment ?? "알 수 없음"}

현재 상황: ${currentSituation}

이 캐릭터의 성향에 완벽히 부합하는 행동 선택지 3개를 생성하세요.
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
