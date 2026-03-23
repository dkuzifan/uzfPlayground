// ============================================================
// Taste Modifier Engine: 취향 트리거 매칭 + 감정 변화량 역전
// ============================================================
// 유저 텍스트에서 NPC의 취향 키워드를 감지하고,
// 기본 감정 변화량(baseDeltas)의 부호를 역전하거나 증폭합니다.
//
// 연산식: finalDelta = baseDelta * multiplier
// multiplier가 음수이면 부호가 역전됩니다.
// (예: 위협 → 기본 affinity -15 * multiplier -1.5 = +22.5)
// ============================================================

import type { TastePreference, TasteModifiers } from "@/lib/trpg/types/character";

// 감정 변화량 기본값 타입 (System GM이 산출한 1차 결과)
export interface EmotionDeltas {
  affinity_delta: number;   // 호감도 변화량
  stress_delta: number;     // 스트레스 변화량
  fear_delta: number;       // 공포 변화량
  trust_delta?: number;     // 신뢰도 변화량 (선택)
}

export interface TasteModifierResult {
  modifiedDeltas: EmotionDeltas;
  triggeredTaste: TastePreference | null;
  triggeredKeyword: string | null;
}

// ── 키워드 매칭 ───────────────────────────────────────────────
// 현재는 단순 includes() 스캔. 키워드 수가 많아지면 Aho-Corasick으로 교체.
function findMatchingTaste(
  userInput: string,
  tastes: TastePreference[]
): { taste: TastePreference; keyword: string } | null {
  const normalizedInput = userInput.toLowerCase();

  for (const taste of tastes) {
    for (const keyword of taste.trigger_keywords) {
      if (normalizedInput.includes(keyword.toLowerCase())) {
        return { taste, keyword };
      }
    }
  }
  return null;
}

// ── 모디파이어 적용 ───────────────────────────────────────────
function applyModifiers(
  baseDeltas: EmotionDeltas,
  modifiers: TasteModifiers
): EmotionDeltas {
  const MAX_DELTA_PER_TURN = 30; // 1턴당 최대 변화량 Cap

  const clamp = (val: number) =>
    Math.max(-MAX_DELTA_PER_TURN, Math.min(MAX_DELTA_PER_TURN, val));

  return {
    affinity_delta: modifiers.affinity_multiplier !== undefined
      ? clamp(baseDeltas.affinity_delta * modifiers.affinity_multiplier)
      : baseDeltas.affinity_delta,

    stress_delta: modifiers.stress_multiplier !== undefined
      ? clamp(baseDeltas.stress_delta * modifiers.stress_multiplier)
      : baseDeltas.stress_delta,

    fear_delta: modifiers.fear_multiplier !== undefined
      ? clamp(baseDeltas.fear_delta * modifiers.fear_multiplier)
      : baseDeltas.fear_delta,

    trust_delta: baseDeltas.trust_delta,
  };
}

// ── 다중 취향 동시 발동 시: 가장 극단적인 multiplier 1개만 적용 ───
function selectDominantTaste(
  matches: Array<{ taste: TastePreference; keyword: string }>
): { taste: TastePreference; keyword: string } {
  return matches.reduce((dominant, current) => {
    const dominantExtreme = Math.max(
      ...Object.values(dominant.taste.modifiers).map(Math.abs)
    );
    const currentExtreme = Math.max(
      ...Object.values(current.taste.modifiers).map(Math.abs)
    );
    return currentExtreme > dominantExtreme ? current : dominant;
  });
}

// ── 메인 함수 ────────────────────────────────────────────────

export function applyTasteModifiers(
  userInput: string,
  tastes: TastePreference[],
  baseDeltas: EmotionDeltas
): TasteModifierResult {
  if (tastes.length === 0) {
    return {
      modifiedDeltas: baseDeltas,
      triggeredTaste: null,
      triggeredKeyword: null,
    };
  }

  // 전체 취향 중 매칭되는 것 모두 탐색
  const allMatches: Array<{ taste: TastePreference; keyword: string }> = [];
  const normalizedInput = userInput.toLowerCase();

  for (const taste of tastes) {
    for (const keyword of taste.trigger_keywords) {
      if (normalizedInput.includes(keyword.toLowerCase())) {
        allMatches.push({ taste, keyword });
        break; // 한 취향당 1번만 매칭
      }
    }
  }

  if (allMatches.length === 0) {
    return {
      modifiedDeltas: baseDeltas,
      triggeredTaste: null,
      triggeredKeyword: null,
    };
  }

  // 다중 발동 시 가장 극단적인 취향 1개 선택
  const { taste, keyword } = allMatches.length === 1
    ? allMatches[0]
    : selectDominantTaste(allMatches);

  return {
    modifiedDeltas: applyModifiers(baseDeltas, taste.modifiers),
    triggeredTaste: taste,
    triggeredKeyword: keyword,
  };
}

// ── 베이스 델타 기본값 생성 (행동 유형별) ─────────────────────
// System GM의 판정 결과나 행동 유형에 따라 기본 감정 변화량을 산출
export function buildBaseDeltas(
  actionType: "attack" | "threaten" | "persuade" | "gift" | "deceive" | "neutral",
  outcome: "critical_success" | "success" | "partial" | "failure" | null
): EmotionDeltas {
  const outcomeMultiplier: Record<string, number> = {
    critical_success: 1.5,
    success: 1.0,
    partial: 0.5,
    failure: 0.3,
  };
  const mult = outcome ? (outcomeMultiplier[outcome] ?? 1.0) : 1.0;

  const baseMap: Record<string, EmotionDeltas> = {
    attack:   { affinity_delta: -20 * mult, stress_delta: 10 * mult, fear_delta: 25 * mult },
    threaten: { affinity_delta: -15 * mult, stress_delta: 20 * mult, fear_delta: 30 * mult },
    persuade: { affinity_delta: 10 * mult,  stress_delta: -5 * mult, fear_delta: -5 * mult, trust_delta: 8 * mult },
    gift:     { affinity_delta: 15 * mult,  stress_delta: -10 * mult, fear_delta: 0 },
    deceive:  { affinity_delta: 5 * mult,   stress_delta: 5 * mult,  fear_delta: 0, trust_delta: -10 * mult },
    neutral:  { affinity_delta: 0, stress_delta: 0, fear_delta: 0 },
  };

  return baseMap[actionType] ?? baseMap.neutral;
}
