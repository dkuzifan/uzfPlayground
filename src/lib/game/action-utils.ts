import type { NpcDynamicState } from "@/lib/types/character";
import type { NpcPersona } from "@/lib/types/game";

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
 * 플레이어 액션 텍스트에서 언급된 NPC를 찾아 대상 NPC 목록을 반환합니다.
 * - NPC 이름이 텍스트에 포함되면 해당 NPC들만 반환
 * - 이름이 없으면 세션의 모든 NPC 반환 (전체 반응)
 * - NPC가 1명이면 항상 그 NPC 반환
 */
export function determineTargetedNpcs(
  actionContent: string,
  npcs: NpcPersona[]
): NpcPersona[] {
  if (npcs.length === 0) return [];
  if (npcs.length === 1) return npcs;

  const lower = actionContent.toLowerCase();
  const mentioned = npcs.filter((npc) =>
    lower.includes(npc.name.toLowerCase())
  );
  return mentioned.length > 0 ? mentioned : npcs;
}
