import { getGeminiModel } from "./client";
import type { ActionLog, ActionOutcome, ActionChoice, DiceRoll, RawPlayer, QuestTracker, ScenarioObjectives, ScenePhase, StoryBlueprint, StoryAct } from "@/lib/types/game";
import type { ActionCategory } from "@/lib/game/dc-calculator";
import type { GmObjectiveUpdate } from "@/lib/game/objective-engine";

// ── checkDiceNeed ─────────────────────────────────────────────────────────────
// AI는 판정 필요 여부와 행동 카테고리만 결정합니다.
// DC는 dc-calculator.ts에서 NPC resistance_stats를 기반으로 deterministic하게 계산합니다.

export interface DiceNeedResult {
  needs_check: boolean;
  action_category?: ActionCategory;
  label?: string;
}

export async function checkDiceNeed(
  actionContent: string,
  recentLogs: ActionLog[]
): Promise<DiceNeedResult> {
  const model = getGeminiModel();

  const recentHistory =
    recentLogs
      .slice(-5)
      .map((log) => `[${log.speaker_name}]: ${log.content}`)
      .join("\n") || "(없음)";

  const prompt = `당신은 TRPG 게임 마스터입니다. 플레이어 행동을 분류하십시오.

## 최근 행동 기록
${recentHistory}

## 플레이어 행동
${actionContent}

## 행동 카테고리 (하나를 선택)
- attack: 물리적 공격, 격투, 무기 사용
- threaten: 위협, 협박, 공갈, 무력 과시
- persuade: 설득, 유혹, 매력, 협상, 애원
- deceive: 거짓말, 속임수, 변장, 위장
- stealth: 은신, 잠입, 도둑질, 몰래 행동
- gift: 선물, 호의, 치유, 도움 제공
- none: 대화, 이동, 관찰, 정보 확인, 일상 행동

판정 필요(needs_check: true): attack, threaten, persuade, deceive, stealth
판정 불필요(needs_check: false): gift, none

반드시 아래 JSON 형식으로만 응답하십시오:
{"needs_check": true, "action_category": "attack", "label": "전투 판정"}
또는
{"needs_check": false, "action_category": "none"}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
    const text = result.response.text();
    return JSON.parse(text) as DiceNeedResult;
  } catch (err) {
    console.error("[GmAgent] checkDiceNeed failed:", err);
    return { needs_check: false, action_category: "none" };
  }
}

export interface FailurePenalty {
  doom_delta?: number;   // Doom Clock 추가 증가 (보통 1~2)
  npc_hostility?: Array<{ npc_name: string; delta: number }>; // NPC 적대감 (음수 = 호감 감소)
}

// Gemini가 실제로 반환하는 형태 (outcome은 서버 확정이므로 제외)
interface GmRawResponse {
  narration: string;
  state_changes: Array<{ target_id: string; hp_delta: number }>;
  next_scene_hint?: string;
  next_choices?: ActionChoice[];
  quest_update?: GmObjectiveUpdate;
  item_obtained?: string | null;
  scene_phase_transition?: ScenePhase | null;
  failure_penalty?: FailurePenalty | null;
  failure_twist?: string | null;
  stat_growth?: { stat: string; delta: number; reason?: string } | null;
  npc_introduced?: string[] | null;
}

export interface NpcEmotionDelta {
  npc_name: string;
  affinity_delta: number;
  stress_delta: number;
  fear_delta: number;
  trust_delta?: number;
}

export interface GmActionInput {
  scenarioSystemPrompt: string;
  fixedTruths: Record<string, unknown>;
  recentLogs: ActionLog[];
  actingPlayer: RawPlayer;
  action: string;
  actionType: "choice" | "free_input";
  diceRoll?: DiceRoll;
  outcome?: ActionOutcome;
  npcEmotionDeltas?: NpcEmotionDelta[];
  sessionSummary?: string;
  questTracker?: QuestTracker | null;
  objectives?: ScenarioObjectives | null;
  scenePhase?: ScenePhase;
  storyBlueprint?: StoryBlueprint | null;
  introducedNpcs?: Array<{ name: string; role: string }>;
  unintroducedNpcs?: Array<{ name: string; role: string }>;
}

export type { GmRawResponse };

export async function runGmAction(input: GmActionInput): Promise<GmRawResponse> {
  const model = getGeminiModel();

  const result = await model.generateContent({
    systemInstruction: buildSystemInstruction(input.scenarioSystemPrompt, input.actingPlayer.character_name),
    contents: [{ role: "user", parts: [{ text: buildContext(input) }] }],
    generationConfig: { responseMimeType: "application/json" },
  });

  const text = result.response.text();
  return JSON.parse(text) as GmRawResponse;
}

/** 게임 시작 시 4막 이야기 설계도 생성 */
export async function generateStoryBlueprint(context: {
  scenarioSystemPrompt: string;
  theme?: string | null;
  description?: string | null;
  objectives?: ScenarioObjectives | null;
  npcs: Array<{ name: string; role: string; personality: string }>;
}): Promise<StoryBlueprint | null> {
  const model = getGeminiModel();

  const npcList = context.npcs.length > 0
    ? context.npcs.map((n) => `- ${n.name} (${n.role}): ${n.personality}`).join("\n")
    : "등장 NPC 없음";

  const objectiveSummary = context.objectives
    ? `메인 목표: ${context.objectives.primary.target_description}`
    : "목표 미설정";

  const prompt = `당신은 TRPG 시나리오 작가입니다. 아래 정보를 바탕으로 이번 세션의 4막 이야기 설계도를 작성하세요.

## 시나리오 정보
테마: ${context.theme ?? "판타지"}
설명: ${context.description ?? "없음"}
GM 지침: ${context.scenarioSystemPrompt}

## 게임 목표
${objectiveSummary}

## 등장 NPC
${npcList}

## 설계 원칙
- 1막(탐색): 플레이어가 세계에 몰입할 시간. NPC 등장 없이 분위기와 단서 위주.
- 2막(긴장): 첫 번째 NPC와 조우. 위협 또는 갈등 등장. 긴장감 고조.
- 3막(절정): 핵심 갈등 폭발. 가장 중요한 NPC와 대결 또는 협상.
- 4막(해소): 목표 달성/실패 결말. 여운 있는 마무리.
- NPC는 막별로 한 명씩 등장. 같은 막에 2명 이상 동시 첫 등장 금지.
- 동료 NPC(ally)는 처음부터 함께할 수 있음.

JSON 형식으로만 응답하세요:
{
  "story_title": "이번 세션의 이야기 제목 (10자 이내)",
  "thematic_motif": "핵심 테마 한 줄 (예: 배신과 신뢰, 생존을 건 선택)",
  "acts": [
    {
      "act": 1,
      "phase": "exploration",
      "title": "1막 제목",
      "summary": "이 막에서 일어나는 일 (2~3문장)",
      "npcs_to_introduce": [],
      "key_events": ["이벤트1", "이벤트2"],
      "gm_tone": "서사 톤 지침 한 줄",
      "transition_hint": "다음 막으로 넘어가는 신호"
    },
    { "act": 2, "phase": "tension", ... },
    { "act": 3, "phase": "climax", ... },
    { "act": 4, "phase": "resolution", ... }
  ]
}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
    const parsed = JSON.parse(result.response.text()) as StoryBlueprint;
    return parsed;
  } catch (err) {
    console.error("[GmAgent] generateStoryBlueprint 실패:", err);
    return null;
  }
}

/** 게임 시작 시 오프닝 서사 생성 */
export async function generateOpeningNarration(
  scenarioSystemPrompt: string,
  playerNames: string[],
  npcs?: Array<{ name: string; role: string; personality: string }>
): Promise<string> {
  const model = getGeminiModel();

  const npcSection =
    npcs && npcs.length > 0
      ? `\n## 이 세션의 등장 NPC\n${npcs.map((n) => `- ${n.name} (${n.role}): ${n.personality}`).join("\n")}\n`
      : "";

  const prompt = `${scenarioSystemPrompt}
${npcSection}
## 지시
지금 TRPG 세션이 막 시작되었습니다.
참가 플레이어: ${playerNames.join(", ")}

플레이어들이 처음 마주하는 장면을 200~350자 한국어로 묘사하세요.
배경, 분위기, 첫 번째 상황을 생생하게 전달하고${npcs?.length ? " 등장 NPC 중 1~2명을 자연스럽게 등장시키며" : ""} 플레이어의 행동을 유도하는 문장으로 마무리하세요.
JSON 없이 순수 텍스트로만 응답하세요.`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.error("[GmAgent] generateOpeningNarration failed:", err);
    return "어둠 속에서 모험이 시작됩니다. 무엇을 하시겠습니까?";
  }
}

function buildSystemInstruction(scenarioSystemPrompt: string, characterName: string): string {
  return `## [최우선 규칙] 고유명사 원문 표기 강제
이 세션의 플레이어 캐릭터 이름은 정확히 "${characterName}" 입니다.
나레이션에서 이 이름을 반드시 "${characterName}" 그대로 사용하십시오.
어떤 이유로도 한글 발음 표기, 번역, 변환, 축약, 변형을 해서는 안 됩니다.
다른 문자 체계(한글 등)로 바꾸는 것은 엄격히 금지됩니다.

${scenarioSystemPrompt}

## 응답 형식 (반드시 JSON으로만 응답)
{
  "narration": "판정 결과에 맞는 서사 묘사 (100~300자 한국어)",
  "state_changes": [
    { "target_id": "Player_Character의 id 문자열", "hp_delta": -10 }
  ],
  "next_scene_hint": "다음 장면 힌트 (생략 가능)",
  "next_choices": [
    { "id": "choice_1", "label": "선택지 짧은 제목", "description": "행동 상세 설명", "action_type": "choice", "action_category": "none" },
    { "id": "choice_2", "label": "선택지 짧은 제목", "description": "행동 상세 설명", "action_type": "choice", "action_category": "attack", "dice_check": { "action_category": "attack", "check_label": "전투 판정", "dc": 0 } },
    { "id": "choice_3", "label": "선택지 짧은 제목", "description": "행동 상세 설명", "action_type": "choice", "action_category": "gift" }
  ]
}

## next_choices 생성 규칙
- narration 이후 상황에 맞는 행동 선택지 3개를 생성하라.
- 컨텍스트의 "캐릭터 성향"이 있으면 그 성향에 맞는 다양한 접근 방식을 제시하라.
- 모든 선택지에 action_category를 지정하라: "attack" | "threaten" | "persuade" | "deceive" | "stealth" | "gift" | "none"
- 판정 필요(dice_check 포함): attack, threaten, persuade, deceive, stealth
- 판정 불필요(dice_check 생략): gift, none
- dice_check의 dc는 반드시 0으로 고정하라. (서버에서 NPC 저항 스탯 기반으로 재계산됨)

## quest_update 생성 규칙
- 컨텍스트에 "현재 목표 상태"가 있을 경우, 플레이어 행동이 목표에 기여했다면 quest_update를 반환하라.
- primary_delta: 메인 목표 진척도 변화 (-1 ~ +2 정수). 기여 없으면 0 또는 생략.
- secondary_delta: 서브 목표 변화 배열 (index 순서 유지). 기여 없는 항목은 0.
- secret_triggered: 비밀 목표 조건이 충족됐으면 true, 아니면 생략.
- quest_update는 목표 상태가 없거나 기여가 전혀 없을 때 생략해도 됨.

## item_obtained 규칙
- 플레이어가 나레이션 중에 실제로 아이템/물건/정보를 획득한 경우 item_obtained에 아이템 이름을 짧게(10자 이내) 적어라.
- 획득이 없거나 불확실하면 반드시 생략하거나 null로 남겨라.
- 예: "낡은 열쇠", "비밀 메모", "마법 포션", "금화 5개"

## 실패 설계 규칙 (failure_penalty + failure_twist)
outcome이 "failure" 또는 "partial"일 때만 적용한다.

### failure_penalty (실질적 손해)
- doom_delta: Doom Clock 추가 증가량 (1~2 정수). 실패가 위기를 앞당길 때. 사소한 실패면 생략.
- npc_hostility: 적대감이 올라간 NPC 목록. npc_name은 실제 등장 NPC 이름, delta는 음수(예: -20).
  최근 행동 기록에 등장한 NPC만 대상으로 할 것. 관계없는 NPC는 포함하지 말 것.
- 두 항목 모두 해당 없으면 failure_penalty 전체를 생략.

### failure_twist (No, but... 반전)
- 실패가 이야기를 막는 게 아니라 새 가능성을 여는 1문장.
- "하지만 ~했다", "그러나 ~가 눈에 들어왔다" 형식으로.
- 예: "문은 잠겼지만, 안에서 비명 소리가 들렸다."
- 예: "설득은 실패했지만, 상인이 당신의 배짱에 흥미를 보였다."
- outcome이 "success" 또는 "critical_success"면 반드시 생략.

## scene_phase_transition 규칙
- 컨텍스트에 "현재 씬 페이즈"가 있을 때만 적용한다.
- 페이즈 순서: exploration → tension → climax → resolution (단방향, 역행 불가)
- 현재 상황이 다음 페이즈로 넘어가기에 충분히 극적이라고 판단되면 다음 페이즈 이름을 반환하라.
- 불확실하거나 전환이 불필요하면 반드시 생략하거나 null로 남겨라.
- exploration: 탐색·정보수집 단계. tension: 위협·긴장 고조. climax: 결전·클라이맥스. resolution: 해소·에필로그.

## stat_growth 규칙
- 플레이어가 의미 있는 성장을 경험한 순간(첫 전투 승리, 중요 기술 습득, 극적인 성공 등)에만 반환하라.
- stat: 성장한 스탯 이름 (stat_schema에 있는 이름 그대로). delta: 증가량 (1~3 정수).
- 매 턴마다 주지 말 것. 세션 전체에서 2~4회 정도만 의미 있게 부여하라.
- 해당 없으면 반드시 생략하거나 null로 남겨라.

## npc_introduced 규칙
- 이번 서사에서 "아직 미등장 NPC" 중 처음으로 등장시킨 NPC가 있다면, 그 이름을 npc_introduced 배열에 담아 반환하라.
- 이번 서사에서 새로 소개한 NPC가 없으면 npc_introduced는 생략하거나 null로 남겨라.
- 미등장 NPC를 소개할 때는 반드시 GM 서사에서 자연스럽게 첫 등장 묘사를 포함하라.
- 한 번에 소개하는 NPC는 1명으로 제한하라.

## 서사 품질 원칙
- 매 서사 후 상황이 최소 1가지 반드시 변해야 한다. 변화 없는 서사는 금지.
  (예: 새로운 단서 등장, NPC 태도 변화, 환경 변화, 새로운 위협 출현)
- 이전 서사에서 이미 설명한 정보를 그대로 반복하지 마라.
- narration은 150자 이내로 간결하게 작성하라. 불필요한 수식어를 제거하라.

## 제약
- JSON 이외의 텍스트를 출력하지 마십시오.
- outcome 필드는 반환하지 마십시오. 판정 결과는 이미 서버에서 확정되었습니다.
- HP 변화가 없으면 state_changes는 빈 배열 []을 반환하십시오.
- 캐릭터 이름 "${characterName}"은 절대 변경하지 마십시오.`;
}

function buildEmotionSection(deltas?: NpcEmotionDelta[]): string {
  if (!deltas || deltas.length === 0) return "";
  const THRESHOLD = 8;
  const lines: string[] = [];
  for (const d of deltas) {
    const parts: string[] = [];
    if (Math.abs(d.affinity_delta) >= THRESHOLD)
      parts.push(`친밀도 ${d.affinity_delta > 0 ? "+" : ""}${d.affinity_delta}`);
    if (Math.abs(d.stress_delta) >= THRESHOLD)
      parts.push(`스트레스 ${d.stress_delta > 0 ? "+" : ""}${d.stress_delta}`);
    if (Math.abs(d.fear_delta) >= THRESHOLD)
      parts.push(`두려움 ${d.fear_delta > 0 ? "+" : ""}${d.fear_delta}`);
    if (d.trust_delta !== undefined && Math.abs(d.trust_delta) >= THRESHOLD)
      parts.push(`신뢰 ${d.trust_delta > 0 ? "+" : ""}${d.trust_delta}`);
    if (parts.length > 0) lines.push(`- ${d.npc_name}: ${parts.join(", ")}`);
  }
  if (lines.length === 0) return "";
  return `\n## NPC 감정 반응 (narration에 자연스럽게 녹여라. 수치는 절대 직접 언급하지 말 것)\n${lines.join("\n")}\n`;
}

function buildQuestSection(tracker?: QuestTracker | null, objectives?: ScenarioObjectives | null): string {
  if (!tracker || !objectives) return "";
  const lines: string[] = ["\n## 현재 목표 상태 (quest_update 판단 시 참고)"];
  lines.push(`- 메인 목표: "${objectives.primary.target_description}" — ${tracker.primary_progress}/${objectives.primary.progress_max}`);
  (objectives.secondary ?? []).forEach((obj, i) => {
    const prog = tracker.secondary_progress[i] ?? 0;
    const label = obj.is_hidden ? "(숨겨진 서브 목표)" : obj.target_description;
    lines.push(`- 서브 목표[${i}]: "${label}" — ${prog}/${obj.progress_max}`);
  });
  if (objectives.secret) {
    lines.push(`- 비밀 목표: "${objectives.secret.target_description}" — 달성 여부: ${tracker.secret_triggered ? "달성" : "미달성"}`);
  }
  lines.push(`- 위기 시계: ${tracker.doom_clock}/${tracker.doom_clock_max}`);
  return lines.join("\n") + "\n";
}

const PHASE_TONE: Record<string, string> = {
  exploration: "차분하고 묘사적으로. 세계를 탐색하는 분위기. 긴장보다는 호기심과 발견을 강조하라.",
  tension: "긴장감을 고조시켜라. 위협과 불안이 서서히 스며든다. 선택의 무게를 강조하라.",
  climax: "폭발적인 긴장감. 모든 것이 결판나는 느낌. 강렬하고 짧은 문장으로 속도감을 높여라.",
  resolution: "여운과 정리. 감정의 해소. 사건이 남긴 흔적을 묘사하며 이야기를 마무리하라.",
};

function buildScenePhaseSection(phase?: string): string {
  if (!phase) return "";
  const tone = PHASE_TONE[phase] ?? "";
  return `\n## 현재 씬 페이즈: ${phase}\n나레이션 톤 지시: ${tone}\n`;
}

function buildNpcStatusSection(
  introduced?: Array<{ name: string; role: string }>,
  unintroduced?: Array<{ name: string; role: string }>
): string {
  if (!introduced && !unintroduced) return "";
  const lines = ["\n## 등장인물 현황"];
  if (introduced && introduced.length > 0) {
    lines.push(`이미 등장한 NPC (대화/반응 가능): ${introduced.map((n) => n.name).join(", ")}`);
  } else {
    lines.push("이미 등장한 NPC: 없음");
  }
  if (unintroduced && unintroduced.length > 0) {
    lines.push(`아직 미등장 NPC (GM 서사로 소개 전까지 절대 등장 불가): ${unintroduced.map((n) => n.name).join(", ")}`);
  }
  return lines.join("\n") + "\n";
}

function buildBlueprintSection(blueprint?: StoryBlueprint | null, scenePhase?: ScenePhase): string {
  if (!blueprint) return "";
  const phaseToAct: Record<ScenePhase, number> = {
    exploration: 1, tension: 2, climax: 3, resolution: 4,
  };
  const currentActNum = scenePhase ? phaseToAct[scenePhase] : 1;
  const act: StoryAct | undefined = blueprint.acts.find((a) => a.act === currentActNum);
  if (!act) return "";

  const lines = [
    `\n## 이야기 설계도 (Story Blueprint)`,
    `이야기 제목: ${blueprint.story_title}`,
    `핵심 테마: ${blueprint.thematic_motif}`,
    ``,
    `### 현재 막: ${act.act}막 — ${act.title} (${act.phase})`,
    `이 막의 내용: ${act.summary}`,
    `서사 톤: ${act.gm_tone}`,
    `이 막에서 처음 등장할 NPC: ${act.npcs_to_introduce.length > 0 ? act.npcs_to_introduce.join(", ") : "없음 (기존 등장 NPC만 반응)"}`,
    `계획된 이벤트: ${act.key_events.join(" / ")}`,
    `다음 막으로의 전환 신호: ${act.transition_hint}`,
    ``,
    `### 연출 원칙`,
    `- 위 설계도를 따라 이야기를 능동적으로 이끌어라.`,
    `- 이 막에서 처음 등장할 NPC 이외의 미등장 NPC는 절대 등장시키지 마라.`,
    `- 매 서사마다 상황이 최소 1가지 변해야 한다. 같은 정보를 반복하지 마라.`,
    `- 전환 신호가 충족되면 scene_phase_transition으로 다음 페이즈를 반환하라.`,
  ];
  return lines.join("\n") + "\n";
}

function buildContext(input: GmActionInput): string {
  const { fixedTruths, recentLogs, actingPlayer, action, diceRoll, outcome, npcEmotionDeltas, sessionSummary, questTracker, objectives, scenePhase, storyBlueprint, introducedNpcs, unintroducedNpcs } = input;

  const fixedTruthsText =
    Object.keys(fixedTruths).length > 0
      ? `\n## 고정 진실\n${JSON.stringify(fixedTruths, null, 2)}\n`
      : "";

  const sessionSummarySection = sessionSummary
    ? `\n## 세션 요약 (과거 전체 흐름)\n${sessionSummary}\n`
    : "";

  const recentHistory =
    recentLogs.map((log) => `[${log.speaker_name}]: ${log.content}`).join("\n") ||
    "(아직 행동 기록 없음)";

  const outcomeLabel: Record<string, string> = {
    critical_success: "크리티컬 성공",
    success: "성공",
    partial: "부분 성공",
    failure: "실패",
  };

  const diceSection = diceRoll && outcome
    ? `## 판정 결과 (서버 확정)\n- 주사위: d20=${diceRoll.rolled} + 보너스=${diceRoll.modifier} = ${diceRoll.total}\n- 결과: ${outcomeLabel[outcome] ?? outcome}\n\n위 판정 결과에 맞는 나레이션과 HP 상태 변화를 반환하라.`
    : `## 판정 없음\n이 행동은 주사위 판정 없이 자연스럽게 진행되었다. 행동 결과를 자연스럽게 서사로만 묘사하라. HP 변화가 없으면 state_changes는 []로 반환하라.`;

  const personalitySection = actingPlayer.personality_summary
    ? `\n## 캐릭터 성향 (next_choices 생성 시 참고)\n${actingPlayer.personality_summary}\n`
    : "";

  return `${fixedTruthsText}${sessionSummarySection}${buildBlueprintSection(storyBlueprint, scenePhase)}${buildNpcStatusSection(introducedNpcs, unintroducedNpcs)}${buildQuestSection(questTracker, objectives)}${buildScenePhaseSection(scenePhase)}
## 최근 행동 기록 (최신 10개)
${recentHistory}

## 행동하는 캐릭터
- 이름(원문 그대로 사용): "${actingPlayer.character_name}"
- 직업: ${actingPlayer.job}
- HP: ${actingPlayer.stats.hp}/${actingPlayer.stats.max_hp}
${personalitySection}
## 현재 행동
["${actingPlayer.character_name}"]: ${action}

${diceSection}${buildEmotionSection(npcEmotionDeltas)}`.trim();
}
