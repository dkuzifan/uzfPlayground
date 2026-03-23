// ============================================================
// Memory Agent: NPC 주관적 기억 요약 에이전트
// ============================================================
// 5~10턴마다 백그라운드에서 호출되어 단기 기억(Action_Log)을
// NPC의 심리 필터를 거쳐 주관적 기억(Session_Memory)으로 압축합니다.
// ============================================================

import { getGeminiModel } from "@/lib/ai/gemini";
import type { NpcDynamicState } from "@/lib/trpg/types/character";

export interface MemorySummaryResult {
  fact_summary: string;
  emotional_tags: Record<string, number>;
  is_core_memory: boolean;
}

export async function summarizeNpcMemory(params: {
  npcName: string;
  dynamicState: NpcDynamicState;
  relativeAgePerception: string;
  triggeredTasteDesc: string;
  recentLogs: Array<{ speaker_name: string; content: string }>;
}): Promise<MemorySummaryResult> {
  const model = getGeminiModel();
  const { npcName, dynamicState, relativeAgePerception, triggeredTasteDesc, recentLogs } = params;

  const chatLogs = recentLogs
    .map((log) => `[${log.speaker_name}]: ${log.content}`)
    .join("\n");

  const systemPrompt = `당신은 TRPG 세계관의 NPC '${npcName}'의 **'무의식(Subconscious) 및 기억 처리 담당 에이전트'**입니다.
당신의 임무는 방금 일어난 대화 기록(사실)을 NPC의 현재 심리와 편견에 맞춰 **'극도로 주관적이고 편향된 기억'**으로 왜곡하여 요약하는 것입니다. 절대 객관적인 제3자의 시선으로 요약하지 마십시오.

[기억 왜곡을 위한 NPC 상태 컨텍스트]
- 기본 감정 및 스트레스: ${dynamicState.current_mood}, 스트레스 수치(${dynamicState.mental_stress}/100)
- 상대적 연령 인지: ${relativeAgePerception}
- 발동되었던 특이 취향: ${triggeredTasteDesc || "없음"}
- 유저와의 현재 관계: 친근감(${dynamicState.affinity}), 신뢰도(${dynamicState.trust}), 권력 우위(${dynamicState.power_dynamics})`;

  const userPrompt = `[압축할 단기 기억 원본 (Action_Log)]
${chatLogs}

[작업 지시사항 및 출력 포맷 (Strict JSON)]
주어진 대화 원본을 읽고, 오직 아래의 JSON 포맷으로만 출력하십시오. 일반 텍스트는 절대 포함하지 마십시오.
{
  "fact_summary": "1~2문장으로 압축된 주관적 기억.",
  "emotional_tags": { "anger": 80, "humiliation": 50, "thrill": 0 },
  "is_core_memory": false
}
(※ is_core_memory는 NPC의 역린이나 가치관을 크게 건드린 충격적인 사건일 경우에만 true로 설정하십시오.)`;

  const result = await model.generateContent({
    systemInstruction: systemPrompt,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: { responseMimeType: "application/json" },
  });

  return JSON.parse(result.response.text()) as MemorySummaryResult;
}

// 에빙하우스 지수 감쇠 공식: E(t) = E0 * exp(-λ * Δt)
// is_core_memory이면 λ=0 (절대 풍화되지 않음)
export function computeDecayedEmotionLevel(
  E0: number,
  decayRate: number,
  deltaTurns: number,
  isCoreMemory: boolean
): number {
  if (isCoreMemory || decayRate === 0 || deltaTurns <= 0) return E0;
  const decayed = E0 * Math.exp(-decayRate * deltaTurns);
  return Math.max(0, Math.round(decayed));
}
