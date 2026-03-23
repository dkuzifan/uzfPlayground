import type { NpcDynamicState } from "@/lib/trpg/types/character";
import type { NpcPersona } from "@/lib/trpg/types/game";
import { evaluateBystanderReactions } from "@/lib/trpg/gemini/npc-agent";

export const JOB_MODIFIERS: Record<string, number> = {
  warrior: 2,
  mage: 2,
  rogue: 2,
  cleric: 2,
  adventurer: 0,
  ranger: 2,
  paladin: 2,
  bard: 1,
};

export function defaultDynamicState(): NpcDynamicState {
  return {
    current_mood: "평온",
    mental_stress: 20,
    physical_fatigue: 10,
    fear_survival: 5,
    self_image_management: 30,
    mob_mentality: 20,
    affinity: 0,
    trust: 0,
    power_dynamics: "대등한 관계",
    personal_debt: 0,
    sense_of_duty: 30,
    camaraderie: 0,
  };
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * 플레이어 액션에 반응할 NPC 목록을 결정합니다.
 * - 이름이 직접 언급된 NPC → 항상 반응
 * - 언급되지 않은 NPC → Gemini가 가치관/성향/상태 기반으로 판단
 * - NPC가 1명이면 항상 반환
 */
export async function determineReactingNpcs(
  actionContent: string,
  npcs: NpcPersona[],
  dynamicStates: Record<string, NpcDynamicState>
): Promise<NpcPersona[]> {
  if (npcs.length === 0) return [];
  if (npcs.length === 1) return npcs;

  const lower = actionContent.toLowerCase();
  const mentioned = npcs.filter((npc) =>
    lower.includes(npc.name.toLowerCase())
  );

  const bystanders = npcs
    .filter((npc) => !mentioned.includes(npc))
    .map((npc) => ({ npc, dynamicState: dynamicStates[npc.id] ?? null }));

  if (bystanders.length === 0) return mentioned;

  const reactingIds = await evaluateBystanderReactions(actionContent, bystanders);
  const reactingBystanders = bystanders
    .filter(({ npc }) => reactingIds.includes(npc.id))
    .map(({ npc }) => npc);

  return [...mentioned, ...reactingBystanders];
}
