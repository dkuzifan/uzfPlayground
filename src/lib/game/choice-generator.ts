import { getGeminiModel } from "@/lib/gemini/client";
import type { ActionChoice } from "@/lib/types/game";
import type { PersonalityProfile } from "@/lib/types/character";

const MBTI_TRAITS: Record<string, string> = {
  INTJ: "전략적이고 독립적, 장기 계획 선호, 감정보다 논리 우선",
  INTP: "분석적이고 호기심 많음, 이론적 탐구 선호",
  ENTJ: "결단력 있고 리더십 강함, 직접적이고 목표 지향적",
  ENTP: "창의적이고 논쟁 즐김, 새로운 가능성 탐색",
  INFJ: "통찰력 있고 이상주의적, 타인의 감정에 민감",
  INFP: "이상주의적이고 공감 능력 강함, 가치 중심 행동",
  ENFJ: "카리스마 있고 타인 중심, 협력과 조화 추구",
  ENFP: "열정적이고 창의적, 다양한 가능성 탐색",
  ISTJ: "신뢰할 수 있고 체계적, 규칙과 의무 중시",
  ISFJ: "헌신적이고 신중함, 타인을 돌보고 전통 중시",
  ESTJ: "실용적이고 조직적, 효율성과 질서 중시",
  ESFJ: "사교적이고 협력적, 타인의 필요를 먼저 생각",
  ISTP: "실용적이고 관찰력 강함, 상황에 유연하게 적응",
  ISFP: "유연하고 감수성 풍부, 현재에 충실하고 예술적",
  ESTP: "대담하고 즉흥적, 직접적인 행동 선호",
  ESFP: "자발적이고 활기차며, 즐거움과 흥분 추구",
};

const ENNEAGRAM_TRAITS: Record<number, string> = {
  1: "완벽주의적이고 원칙 중심, 옳고 그름에 민감",
  2: "타인을 돕고 싶어하며, 관계와 인정 중시",
  3: "성취 지향적이고 효율적, 성공과 이미지 관리",
  4: "독창적이고 감성적, 자신의 정체성과 의미 추구",
  5: "지식과 정보 수집 선호, 독립적이고 분석적",
  6: "안전과 신뢰를 추구, 충성스럽고 신중함",
  7: "다양한 경험 추구, 낙관적이고 즉흥적",
  8: "강인하고 직접적, 통제력과 자율성 중시",
  9: "평화를 추구하고 갈등 회피, 조화 중심",
};

const DND_ALIGNMENT_TRAITS: Record<string, string> = {
  "lawful-good": "규칙을 지키며 타인을 돕는 행동 선호",
  "neutral-good": "상황에 맞게 선한 행동을 추구",
  "chaotic-good": "자유롭게 선을 추구, 규칙보다 결과 중시",
  "lawful-neutral": "질서와 규칙을 중시, 중립적 입장 유지",
  "true-neutral": "균형과 중립을 유지, 편향 없음",
  "chaotic-neutral": "개인의 자유를 최우선, 예측 불가능한 행동",
  "lawful-evil": "규칙을 이용해 자신의 이익 추구",
  "neutral-evil": "순수하게 자기 이익만 추구",
  "chaotic-evil": "무질서하고 파괴적, 충동적으로 행동",
};

export function buildPersonalityDescription(personality: PersonalityProfile | null): string {
  if (!personality) return "특별한 성향 없음";

  const parts: string[] = [];
  if (personality.mbti) {
    parts.push(`MBTI ${personality.mbti}: ${MBTI_TRAITS[personality.mbti] ?? ""}`);
  }
  if (personality.enneagram) {
    parts.push(`에니어그램 ${personality.enneagram}번: ${ENNEAGRAM_TRAITS[personality.enneagram] ?? ""}`);
  }
  if (personality.dnd_alignment) {
    parts.push(`D&D 성향 ${personality.dnd_alignment}: ${DND_ALIGNMENT_TRAITS[personality.dnd_alignment] ?? ""}`);
  }
  if (personality.summary) {
    parts.push(`추가 성향: ${personality.summary}`);
  }
  return parts.join("\n") || "특별한 성향 없음";
}

export async function generateChoices(
  personality: PersonalityProfile | null,
  currentSituation: string,
  characterName: string
): Promise<ActionChoice[]> {
  const model = getGeminiModel();
  const style = buildPersonalityDescription(personality);

  const prompt = `
캐릭터 "${characterName}"의 행동 성향: ${style}

현재 상황:
${currentSituation}

이 캐릭터의 성향에 맞는 행동 선택지 3개를 생성하세요.
각 선택지는 서로 다른 접근 방식을 나타내야 합니다.

## 행동 카테고리 분류
모든 선택지에 action_category를 반드시 지정하세요.
action_category는 반드시 다음 중 하나: "attack" | "threaten" | "persuade" | "deceive" | "stealth" | "gift" | "none"
- attack: 물리적 공격, 격투
- threaten: 위협, 협박, 공갈
- persuade: 설득, 협상, 애원
- deceive: 거짓말, 속임수
- stealth: 은신, 잠입
- gift: 선물, 호의, 도움 제공, 치유
- none: 대화, 이동, 관찰, 정보 확인, 일상 행동

## 주사위 판정 부여 기준 (매우 중요)
dice_check는 3개 선택지 중 최대 1개에만 부여하세요. 상황이 안전하거나 갈등이 없다면 0개도 허용합니다.

dice_check를 붙여야 하는 조건 (모두 충족해야 함):
1. 성공과 실패 모두 가능한 진짜 불확실한 상황일 것
2. 실패했을 때 스토리에 의미 있는 변화가 생길 것 (단순 실패가 아니라 새로운 전개)
3. 캐릭터의 현재 역량으로 결과가 갈릴 수 있을 것

dice_check를 붙이면 안 되는 경우:
- 단순 이동, 관찰, 대화, 정보 수집
- 이미 성공이 거의 확정된 행동
- 실패해도 이야기가 막히거나 변화가 없는 행동
- 상황이 이미 해결되었거나 갈등이 없는 경우

check_label 예시: "전투 판정", "위협 판정", "설득 판정", "기만 판정", "잠입 판정"

JSON 배열로만 응답하세요 (dc 필드는 포함하지 마세요 — 서버에서 자동 계산됨):
[
  { "id": "choice_1", "label": "선택지 짧은 제목", "description": "행동 상세 설명", "action_type": "choice", "action_category": "none" },
  { "id": "choice_2", "label": "선택지 짧은 제목", "description": "행동 상세 설명", "action_type": "choice", "action_category": "attack", "dice_check": { "action_category": "attack", "check_label": "전투 판정" } },
  { "id": "choice_3", "label": "선택지 짧은 제목", "description": "행동 상세 설명", "action_type": "choice", "action_category": "gift" }
]
`.trim();

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
  });

  const raw = JSON.parse(result.response.text()) as ActionChoice[];

  // Gemini가 dc를 문자열로 반환하는 경우 방어 — 반드시 number로 변환
  return raw.map((choice) =>
    choice.dice_check
      ? { ...choice, dice_check: { ...choice.dice_check, dc: Number(choice.dice_check.dc) || 13 } }
      : choice
  );
}
