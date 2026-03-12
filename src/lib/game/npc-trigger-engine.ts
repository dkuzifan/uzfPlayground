import type { NpcDynamicState } from "@/lib/types/character";
import type { NpcPersona } from "@/lib/types/game";

// ── 트리거 타입 ───────────────────────────────────────────────

export type NpcTriggerType =
  | "fear_flee"        // 공포 극한 → 도망 / 항복
  | "affinity_confide"; // 호감 극대 → 비밀 공유

// 트리거 임계값
const FEAR_FLEE_THRESHOLD    = 80;  // fear_survival ≥ 80
const AFFINITY_CONFIDE_THRESHOLD = 85;  // affinity ≥ 85

export interface NpcTriggerEvent {
  npc: NpcPersona;
  trigger: NpcTriggerType;
  contextHint: string;  // NPC 자발 행동 생성 프롬프트 힌트
}

// ── 트리거 평가 ───────────────────────────────────────────────
// 매 턴 종료 시 호출 — 조건을 충족하고 아직 발동되지 않은 트리거 목록 반환

export function evaluateTriggers(
  npcs: NpcPersona[],
  dynamicStates: Record<string, NpcDynamicState>
): NpcTriggerEvent[] {
  const events: NpcTriggerEvent[] = [];

  for (const npc of npcs) {
    const state = dynamicStates[npc.id];
    if (!state) continue;

    const fired = state.fired_triggers ?? [];

    // 공포 극한 트리거
    if (!fired.includes("fear_flee") && state.fear_survival >= FEAR_FLEE_THRESHOLD) {
      events.push({
        npc,
        trigger: "fear_flee",
        contextHint: `${npc.name}의 공포심이 한계에 달했다(공포 수치: ${state.fear_survival}/100). 더 이상 버티지 못하고 도망치거나 무릎을 꿇고 항복을 선언한다. 절박하고 두려운 내면을 드러내며 자발적으로 행동하라.`,
      });
    }

    // 호감 극대 트리거
    if (!fired.includes("affinity_confide") && state.affinity >= AFFINITY_CONFIDE_THRESHOLD) {
      events.push({
        npc,
        trigger: "affinity_confide",
        contextHint: `${npc.name}이 플레이어를 깊이 신뢰하게 됐다(호감도: ${state.affinity}/100). 지금까지 숨겨왔던 비밀 정보, 개인적인 고백, 또는 숨겨진 약점을 플레이어에게 먼저 털어놓는다. 진심 어린 따뜻한 어조로 말하라.`,
      });
    }
  }

  return events;
}

// ── 트리거 발동 기록 ──────────────────────────────────────────
// 발동 후 fired_triggers에 추가하여 중복 방지

export function markTriggerFired(
  state: NpcDynamicState,
  trigger: NpcTriggerType
): NpcDynamicState {
  const fired = state.fired_triggers ?? [];
  return { ...state, fired_triggers: [...fired, trigger] };
}
