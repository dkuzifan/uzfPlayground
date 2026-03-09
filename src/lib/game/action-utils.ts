import type { NpcDynamicState } from "@/lib/types/character";

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
