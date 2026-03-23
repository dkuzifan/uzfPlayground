// ============================================================
// NPC System Prompt: buildNpcPrompt 래퍼
// ============================================================
// npc-agent.ts에서 호출하는 진입점입니다.
// 단순 NPC 데이터만 있는 경우(기존 레거시 호환)와
// 전체 v2 컨텍스트가 있는 경우를 모두 지원합니다.
// ============================================================

import type { NpcPersona, NpcMemory } from "@/lib/trpg/types/game";
import type { NpcDynamicState, SpeciesInfo } from "@/lib/trpg/types/character";
import { buildNpcPrompt, type NpcPromptInput, type LoreContext } from "@/lib/trpg/game/npc-prompt-builder";
import { computeAgeMatrix } from "@/lib/trpg/game/age-matrix";

// 기본 NpcDynamicState (v2 데이터 없을 때 사용)
function defaultDynamicState(): NpcDynamicState {
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

// 기본 SpeciesInfo (v2 종족 데이터 없을 때 사용)
function defaultSpeciesInfo(): SpeciesInfo {
  return {
    species_name: "인간",
    current_age: 25,
    expected_lifespan: 80,
    size_category: "표준형",
  };
}

// 빈 LoreContext
function emptyLore(): LoreContext {
  return { currentLoreTexts: [], pendingQueueNames: [] };
}

// ── 풀 컨텍스트 빌드 (v2) ────────────────────────────────────

export function buildNpcSystemPrompt(
  npc: NpcPersona,
  options?: {
    playerName?: string;
    playerSpeciesInfo?: SpeciesInfo;
    dynamicState?: NpcDynamicState;
    memories?: NpcMemory[];
    lore?: LoreContext;
  }
): string {
  const playerSpeciesInfo = options?.playerSpeciesInfo ?? defaultSpeciesInfo();
  const dynamicState = options?.dynamicState ?? defaultDynamicState();
  const ageMatrix = computeAgeMatrix(npc.species_info, playerSpeciesInfo);

  const promptInput: NpcPromptInput = {
    npc,
    playerSpeciesInfo,
    dynamicState,
    ageMatrix,
    triggeredTaste: null, // 취향 트리거는 action route에서 계산 후 주입
    memories: options?.memories ?? [],
    lore: options?.lore ?? emptyLore(),
  };

  return buildNpcPrompt(promptInput, options?.playerName ?? "플레이어");
}
