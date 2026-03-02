import { getGeminiModel } from "./client";
import type { ActionLog, ActionOutcome, DiceRoll, RawPlayer } from "@/lib/types/game";

// ── checkDiceNeed ─────────────────────────────────────────────────────────────

export interface DiceNeedResult {
  needs_check: boolean;
  dc?: number;
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

  const prompt = `당신은 TRPG 게임 마스터입니다. 플레이어 행동이 주사위 판정(d20)이 필요한지 판단하십시오.

## 최근 행동 기록
${recentHistory}

## 플레이어 행동
${actionContent}

## 판정 기준
- 판정 필요: 전투, 공격, 방어, 회피, 도주, 잠입, 설득, 협박, 위협, 수색, 자물쇠 따기, 물리적 도전, 위험한 행동
- 판정 불필요: 대화, 단순 이동, 관찰, 정보 확인, 일상 행동

## DC 기준
- 쉬움 (8~10): 기본적인 신체 동작, 익숙한 기술
- 보통 (12~14): 표준적인 전투 행동, 일반적인 설득
- 어려움 (15~17): 숙련된 기술이 필요한 행동, 강적과의 전투
- 매우 어려움 (18~20): 극한의 상황, 강력한 적

반드시 아래 JSON 형식으로만 응답하십시오:
{"needs_check": true, "dc": 13, "label": "전투 판정"}
또는
{"needs_check": false}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
    const text = result.response.text();
    return JSON.parse(text) as DiceNeedResult;
  } catch {
    // Gemini 실패 시 판정 불필요로 처리 (플로우 중단 방지)
    return { needs_check: false };
  }
}

// Gemini가 실제로 반환하는 형태 (outcome은 서버 확정이므로 제외)
interface GmRawResponse {
  narration: string;
  state_changes: Array<{ target_id: string; hp_delta: number }>;
  next_scene_hint?: string;
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
}

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
  "next_scene_hint": "다음 장면 힌트 (생략 가능)"
}

## 제약
- JSON 이외의 텍스트를 출력하지 마십시오.
- outcome 필드는 반환하지 마십시오. 판정 결과는 이미 서버에서 확정되었습니다.
- HP 변화가 없으면 state_changes는 빈 배열 []을 반환하십시오.
- 캐릭터 이름 "${characterName}"은 절대 변경하지 마십시오.`;
}

function buildContext(input: GmActionInput): string {
  const { fixedTruths, recentLogs, actingPlayer, action, diceRoll, outcome } = input;

  const fixedTruthsText =
    Object.keys(fixedTruths).length > 0
      ? `\n## 고정 진실\n${JSON.stringify(fixedTruths, null, 2)}\n`
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

  return `${fixedTruthsText}
## 최근 행동 기록
${recentHistory}

## 행동하는 캐릭터
- 이름(원문 그대로 사용): "${actingPlayer.character_name}"
- 직업: ${actingPlayer.job}
- HP: ${actingPlayer.stats.hp}/${actingPlayer.stats.max_hp}

## 현재 행동
["${actingPlayer.character_name}"]: ${action}

${diceSection}`.trim();
}
