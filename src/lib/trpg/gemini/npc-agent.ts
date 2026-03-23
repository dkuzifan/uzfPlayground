import { getGeminiModel } from "@/lib/ai/gemini";
import { buildNpcSystemPrompt } from "@/lib/trpg/gemini/prompts/npc-system";
import type { NpcPersona, NpcMemory, ActionLog } from "@/lib/trpg/types/game";
import type { NpcDynamicState, SpeciesInfo } from "@/lib/trpg/types/character";
import type { LoreContext } from "@/lib/trpg/game/npc-prompt-builder";
import type { NpcTriggerType } from "@/lib/trpg/game/npc-trigger-engine";

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

export interface NpcResponse {
  stage_direction: string;
  dialogue: string;
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
): Promise<NpcResponse> {
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
    generationConfig: { responseMimeType: "application/json" },
  });

  try {
    const parsed = JSON.parse(result.response.text());
    return {
      stage_direction: parsed.stage_direction ?? "",
      dialogue: parsed.dialogue ?? result.response.text(),
    };
  } catch {
    // JSON 파싱 실패 시 전체 텍스트를 dialogue로 사용
    return { stage_direction: "", dialogue: result.response.text() };
  }
}

// ── NPC 자발 행동 생성 ────────────────────────────────────────
// 이벤트 트리거 발동 시 NPC가 플레이어 행동 없이 스스로 말하거나 행동한다.

export async function runNpcAutonomousAction(
  npc: NpcPersona,
  trigger: NpcTriggerType,
  contextHint: string,
  recentLogs: ActionLog[],
  dynamicState?: NpcDynamicState
): Promise<NpcResponse> {
  const model = getGeminiModel();

  const recentHistory = recentLogs
    .slice(-6)
    .map((l) => `[${l.speaker_name}]: ${l.content}`)
    .join("\n") || "(아직 대화 없음)";

  const systemPrompt = buildNpcSystemPrompt(npc, { dynamicState });

  const userPrompt = `## 최근 대화 기록
${recentHistory}

## 자발 행동 지시
${contextHint}

위 상황에서 ${npc.name}이 플레이어의 행동을 기다리지 않고 스스로 말하거나 행동합니다.
NPC의 언어 스타일과 성격을 유지하며, 시스템 프롬프트의 JSON 출력 포맷을 따르세요.`;

  try {
    const result = await model.generateContent({
      systemInstruction: systemPrompt,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
    const parsed = JSON.parse(result.response.text());
    return {
      stage_direction: parsed.stage_direction ?? "",
      dialogue: parsed.dialogue ?? result.response.text(),
    };
  } catch (err) {
    console.error(`[NpcAgent] runNpcAutonomousAction failed (npc=${npc.id}, trigger=${trigger}):`, err);
    const fallbackDialogue = trigger === "fear_flee"
      ? `두려움에 떨며 뒷걸음질 쳤다.`
      : trigger === "bystander_reaction"
        ? `그 광경을 잠자코 바라보았다.`
        : `잠시 망설이다 조용히 입을 열었다.`;
    return { stage_direction: fallbackDialogue, dialogue: "" };
  }
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

// ── 시나리오 컨텍스트 기반 NPC 일괄 생성 ────────────────────────────────────

export interface GeneratedNpcData {
  name: string;
  role: "enemy" | "ally" | "neutral" | "boss";
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
  knowledge_level: number;
}

export async function generateNpcsForScenario(scenarioContext: {
  gm_system_prompt: string;
  theme?: string | null;
  description?: string | null;
}): Promise<GeneratedNpcData[]> {
  const model = getGeminiModel();

  const contextParts = [
    scenarioContext.theme ? `테마: ${scenarioContext.theme}` : null,
    scenarioContext.description ? `시나리오 설명: ${scenarioContext.description}` : null,
    `GM 지침:\n${scenarioContext.gm_system_prompt}`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `다음 TRPG 시나리오에 등장할 NPC 2~4명을 생성하세요.

${contextParts}

조건:
- 시나리오 맥락에 자연스럽게 어울리는 인물들
- 플레이어가 마주칠 가능성이 높은 인물 위주
- 성향 다양화: ally(우호적), neutral(중립), enemy(적대적), boss(주요 적/보스) 중 섞어서 구성
- 각자 뚜렷한 개성과 말투

JSON 배열로만 응답하세요:
[
  {
    "name": "NPC 이름",
    "role": "ally | neutral | enemy | boss 중 하나",
    "appearance": "외형 묘사 (2~3문장)",
    "personality": "성격 묘사 (2~3문장)",
    "mbti": "MBTI 4자리",
    "enneagram": 에니어그램 번호(1-9),
    "dnd_alignment": "lawful-good | neutral-evil 등 9가지 중 하나",
    "hidden_motivation": { "goal": "숨겨진 목표", "secret": "비밀" },
    "system_prompt": "이 NPC로 대화할 때의 역할 지시어 (3~5문장, 한국어)",
    "linguistic_profile": {
      "speech_style": "말투 설명",
      "sentence_ending": "자주 쓰는 어미 패턴 (없으면 빈 문자열)",
      "honorific_rules": "존댓말/하대 기준",
      "vocal_tics": "말버릇 (없으면 빈 문자열)",
      "evasion_style": "화제를 돌릴 때 방식",
      "forbidden_words": []
    },
    "knowledge_level": 세계관 지식 수준(1-10, 평민=1-3, 상인/군인=4-5, 학자/귀족=6-7, 극비=8-10)
  }
]`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
    const parsed = JSON.parse(result.response.text());
    return Array.isArray(parsed) ? (parsed as GeneratedNpcData[]) : [];
  } catch (err) {
    console.error("[NpcAgent] generateNpcsForScenario 실패:", err);
    return [];
  }
}
