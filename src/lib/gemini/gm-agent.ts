import { getGeminiModel } from "./client";
import type { ActionLog, ActionOutcome, DiceRoll, RawPlayer } from "@/lib/types/game";

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
  diceRoll: DiceRoll;
  outcome: ActionOutcome;
}

export async function runGmAction(input: GmActionInput): Promise<GmRawResponse> {
  const model = getGeminiModel();

  const result = await model.generateContent({
    systemInstruction: buildSystemInstruction(input.scenarioSystemPrompt),
    contents: [{ role: "user", parts: [{ text: buildContext(input) }] }],
    generationConfig: { responseMimeType: "application/json" },
  });

  const text = result.response.text();
  return JSON.parse(text) as GmRawResponse;
}

function buildSystemInstruction(scenarioSystemPrompt: string): string {
  return `${scenarioSystemPrompt}

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
- HP 변화가 없으면 state_changes는 빈 배열 []을 반환하십시오.`;
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

  return `${fixedTruthsText}
## 최근 행동 기록
${recentHistory}

## 행동하는 캐릭터
- 이름: ${actingPlayer.character_name}
- 직업: ${actingPlayer.job}
- HP: ${actingPlayer.stats.hp}/${actingPlayer.stats.max_hp}

## 현재 행동
[${actingPlayer.character_name}]: ${action}

## 판정 결과 (서버 확정)
- 주사위: d20=${diceRoll.rolled} + 보너스=${diceRoll.modifier} = ${diceRoll.total}
- 결과: ${outcomeLabel[outcome ?? ""] ?? outcome}

위 판정 결과에 맞는 나레이션과 HP 상태 변화를 반환하라.`.trim();
}
