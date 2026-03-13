import { getGeminiModel } from "./client";
import type { ActionLog, ActionOutcome, ActionChoice, DiceRoll, RawPlayer, QuestTracker, ScenarioObjectives, ScenePhase } from "@/lib/types/game";
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

/** 게임 시작 시 오프닝 서사 생성 */
export async function generateOpeningNarration(
  scenarioSystemPrompt: string,
  playerNames: string[]
): Promise<string> {
  const model = getGeminiModel();
  const prompt = `${scenarioSystemPrompt}

## 지시
지금 TRPG 세션이 막 시작되었습니다.
참가 플레이어: ${playerNames.join(", ")}

플레이어들이 처음 마주하는 장면을 200~350자 한국어로 묘사하세요.
배경, 분위기, 첫 번째 상황을 생생하게 전달하고 플레이어의 행동을 유도하는 문장으로 마무리하세요.
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

function buildContext(input: GmActionInput): string {
  const { fixedTruths, recentLogs, actingPlayer, action, diceRoll, outcome, npcEmotionDeltas, sessionSummary, questTracker, objectives, scenePhase } = input;

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

  return `${fixedTruthsText}${sessionSummarySection}${buildQuestSection(questTracker, objectives)}${buildScenePhaseSection(scenePhase)}
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
