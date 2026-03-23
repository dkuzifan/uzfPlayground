// ============================================================
// DC Calculator: 동적 DC 산출 + 스탯 기반 modifier
// ============================================================
// DC = base(NPC 저항) + state_delta(NPC 심리 상태) + env_delta(환경)
// modifier = 캐릭터 스탯에서 관련 값 추출 (직업 하드코딩 제거)
// ============================================================

import type { ResistanceStats, NpcDynamicState } from "@/lib/trpg/types/character";

export type ActionCategory =
  | "attack"    // 물리적 공격
  | "threaten"  // 위협/협박
  | "persuade"  // 설득/협상
  | "deceive"   // 속임/거짓말
  | "stealth"   // 은신/잠입
  | "gift"      // 선물/호의 — 판정 없음
  | "none";     // 일반 행동 — 판정 없음

export interface DCContext {
  category: ActionCategory;
  resistance: ResistanceStats;
  dynamicState?: NpcDynamicState | null;
  environment?: { weather: string; time_of_day: string } | null;
}

// ── 기본 DC (NPC 저항 스탯 기반) ─────────────────────────────────────

function getBaseDC(category: ActionCategory, resistance: ResistanceStats): number {
  switch (category) {
    case "attack":
    case "threaten":
      return resistance.physical_defense;
    case "persuade":
      return resistance.mental_willpower;
    case "deceive":
    case "stealth":
      return resistance.perception;
    default:
      return 12;
  }
}

// ── NPC 심리 상태 보정 ─────────────────────────────────────────────────

function getStateDelta(category: ActionCategory, state: NpcDynamicState | null | undefined): number {
  if (!state) return 0;
  let delta = 0;

  if (category === "persuade") {
    // 호감도: 높을수록 설득 쉬움
    if (state.affinity > 50)       delta -= 3;
    else if (state.affinity > 20)  delta -= 1;
    else if (state.affinity < -30) delta += 3;
    else if (state.affinity < -10) delta += 1;
    // 신뢰도: 신뢰하면 설득 쉬움
    if (state.trust > 50)          delta -= 2;
    else if (state.trust < -30)    delta += 2;
    // 스트레스: 극한 스트레스면 판단 흐려짐
    if (state.mental_stress > 80)  delta -= 1;
  }

  if (category === "threaten") {
    // 공포가 높으면 위협 쉬움
    if (state.fear_survival > 70)       delta -= 4;
    else if (state.fear_survival > 40)  delta -= 2;
    // 극한 스트레스: 판단력 저하
    if (state.mental_stress > 80)       delta -= 2;
    // 전우애: 친밀한 사이면 위협 어려움
    if (state.camaraderie > 60)         delta += 2;
  }

  if (category === "deceive") {
    // 신뢰 높으면 의심 안 함 → 속이기 쉬움
    if (state.trust > 60)          delta -= 2;
    // 신뢰 낮으면 의심 많음 → 속이기 어려움
    else if (state.trust < -20)    delta += 3;
    // 스트레스 높으면 경계심 낮아짐
    if (state.mental_stress > 80)  delta -= 1;
  }

  if (category === "attack") {
    // 신체 피로: 방어력 저하
    if (state.physical_fatigue > 70) delta -= 2;
    // 전우애: 동료 공격은 더 어려움
    if (state.camaraderie > 60)      delta += 2;
  }

  if (category === "stealth") {
    // 경계 상태(스트레스 높음): 눈치가 빨라짐
    if (state.mental_stress > 60)  delta += 2;
    if (state.fear_survival > 60)  delta += 1;
  }

  return delta;
}

// ── 환경 보정 ──────────────────────────────────────────────────────────

function getEnvDelta(
  category: ActionCategory,
  env: { weather: string; time_of_day: string } | null | undefined
): number {
  if (!env) return 0;
  let delta = 0;
  const weather = env.weather?.toLowerCase() ?? "";
  const time = env.time_of_day?.toLowerCase() ?? "";

  if (category === "stealth") {
    if (time.includes("심야") || time.includes("새벽")) delta -= 3;
    if (weather.includes("안개"))                        delta -= 3;
    if (weather.includes("폭우") || weather.includes("비")) delta -= 1;
    if (time.includes("낮") || time.includes("정오"))    delta += 2;
  }

  if (category === "attack") {
    if (weather.includes("폭우") || weather.includes("폭풍")) delta += 2;
    if (weather.includes("눈"))                               delta += 1;
  }

  if (category === "persuade" || category === "deceive") {
    if (time.includes("심야"))   delta += 1; // 심야: 경계심 상승
    if (time.includes("황혼") || time.includes("저녁")) delta += 0; // neutral
  }

  return delta;
}

// ── 메인 동적 DC 함수 ──────────────────────────────────────────────────

export function computeDynamicDC(ctx: DCContext): number | null {
  if (ctx.category === "none" || ctx.category === "gift") return null;

  let dc = getBaseDC(ctx.category, ctx.resistance);
  dc += getStateDelta(ctx.category, ctx.dynamicState);
  dc += getEnvDelta(ctx.category, ctx.environment);

  return Math.max(5, Math.min(25, dc));
}

// ── 스탯 기반 modifier (직업 하드코딩 대체) ────────────────────────────

const CATEGORY_STAT_KEYS: Record<ActionCategory, string[]> = {
  attack:   ["attack", "strength", "str", "combat", "power", "might"],
  threaten: ["attack", "strength", "str", "intimidate", "power"],
  persuade: ["social", "charisma", "charm", "persuade", "influence", "talk", "speech"],
  deceive:  ["investigation", "cunning", "stealth", "dex", "agility"],
  stealth:  ["stealth", "agility", "speed", "dex", "investigation"],
  gift:     [],
  none:     [],
};

// 스탯 키 이름으로 최대값 범위를 추정 (퍼센트 계열 vs 절댓값 계열)
function guessStatMax(key: string): number {
  const pctPatterns = [
    "hp", "sanity", "investigation", "social", "composure", "luck",
    "stealth", "perception", "mental", "spirit", "influence", "charisma", "charm",
  ];
  return pctPatterns.some((p) => key.toLowerCase().includes(p)) ? 100 : 20;
}

function statValueToModifier(value: number, key: string): number {
  const max = guessStatMax(key);
  const pct = Math.min(100, (value / max) * 100);
  if (pct >= 85) return 2;
  if (pct >= 65) return 1;
  if (pct >= 35) return 0;
  if (pct >= 15) return -1;
  return -2;
}

export function computeStatModifier(
  stats: Record<string, number>,
  category: ActionCategory
): number {
  const preferredKeys = CATEGORY_STAT_KEYS[category] ?? [];
  const statKeys = Object.keys(stats).filter((k) => !k.endsWith("_max"));

  for (const preferred of preferredKeys) {
    const match = statKeys.find(
      (k) => k.toLowerCase() === preferred || k.toLowerCase().includes(preferred)
    );
    if (match) {
      return statValueToModifier(stats[match], match);
    }
  }

  return 0; // 해당 카테고리에 맞는 스탯 없음 → 보정 없음
}

// ── 레거시 폴백 ────────────────────────────────────────────────────────

export function defaultResistanceStats(): ResistanceStats {
  return {
    physical_defense: 13,
    mental_willpower: 12,
    perception: 11,
  };
}
