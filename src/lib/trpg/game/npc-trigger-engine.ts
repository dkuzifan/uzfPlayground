import type { NpcDynamicState } from "@/lib/trpg/types/character";
import type { NpcPersona, NpcCustomTrigger } from "@/lib/trpg/types/game";

// ── 트리거 타입 ───────────────────────────────────────────────

export type NpcTriggerType =
  | "fear_flee"           // 공포 극한 → 도망 / 항복
  | "affinity_confide"    // 호감 극대 → 비밀 공유
  | "bystander_reaction"  // 방관자 목격 반응
  | "inactive_approach"   // N턴 비상호작용 → NPC 먼저 말 걸어옴
  | `custom_${string}`;   // 제작자 정의 커스텀 트리거

// 내장 트리거 임계값
const FEAR_FLEE_THRESHOLD       = 80;   // fear_survival ≥ 80
const AFFINITY_CONFIDE_THRESHOLD = 85;  // affinity ≥ 85
const INACTIVE_TURNS_THRESHOLD   = 5;   // 5턴 이상 비상호작용

export interface NpcTriggerEvent {
  npc: NpcPersona;
  trigger: NpcTriggerType;
  contextHint: string;  // NPC 자발 행동 생성 프롬프트 힌트
}

// ── 트리거 평가 ───────────────────────────────────────────────
// 매 턴 종료 시 호출 — 조건을 충족하고 아직 발동되지 않은 트리거 목록 반환

export function evaluateTriggers(
  npcs: NpcPersona[],
  dynamicStates: Record<string, NpcDynamicState>,
  currentTurn: number = 0,
): NpcTriggerEvent[] {
  const events: NpcTriggerEvent[] = [];

  for (const npc of npcs) {
    // is_introduced가 false인 NPC는 아직 등장 전 → 트리거 무시
    if (!npc.is_introduced) continue;

    const state = dynamicStates[npc.id];
    if (!state) continue;

    const fired = state.fired_triggers ?? [];

    // ── 내장 트리거: 공포 극한 ──────────────────────────────
    if (!fired.includes("fear_flee") && state.fear_survival >= FEAR_FLEE_THRESHOLD) {
      events.push({
        npc,
        trigger: "fear_flee",
        contextHint: `${npc.name}의 공포심이 한계에 달했다(공포 수치: ${state.fear_survival}/100). 더 이상 버티지 못하고 도망치거나 무릎을 꿇고 항복을 선언한다. 절박하고 두려운 내면을 드러내며 자발적으로 행동하라.`,
      });
    }

    // ── 내장 트리거: 호감 극대 ──────────────────────────────
    if (!fired.includes("affinity_confide") && state.affinity >= AFFINITY_CONFIDE_THRESHOLD) {
      events.push({
        npc,
        trigger: "affinity_confide",
        contextHint: `${npc.name}이 플레이어를 깊이 신뢰하게 됐다(호감도: ${state.affinity}/100). 지금까지 숨겨왔던 비밀 정보, 개인적인 고백, 또는 숨겨진 약점을 플레이어에게 먼저 털어놓는다. 진심 어린 따뜻한 어조로 말하라.`,
      });
    }

    // ── 내장 트리거: 비상호작용 접근 ────────────────────────
    const triggerId = "inactive_approach";
    const lastInteraction = state.last_interaction_turn ?? 0;
    const inactiveTurns = currentTurn - lastInteraction;

    if (
      !fired.includes(triggerId) &&
      currentTurn > 0 &&
      inactiveTurns >= INACTIVE_TURNS_THRESHOLD
    ) {
      events.push({
        npc,
        trigger: "inactive_approach",
        contextHint: `${npc.name}과 플레이어가 ${inactiveTurns}턴 동안 상호작용하지 않았다. NPC가 먼저 플레이어에게 말을 걸거나, 주의를 끄는 행동을 한다. 자신의 성격에 맞게 자연스럽게 접근하라.`,
      });
    }

    // ── 커스텀 트리거 ────────────────────────────────────────
    const customTriggers: NpcCustomTrigger[] = (npc.custom_triggers ?? []);
    for (const ct of customTriggers) {
      const triggerId = `custom_${ct.id}`;
      if (ct.once && fired.includes(triggerId)) continue;

      const fieldValue = (state as unknown as Record<string, unknown>)[ct.condition_field];
      if (typeof fieldValue !== "number") continue;

      const conditionMet =
        ct.condition_op === ">=" ? fieldValue >= ct.condition_value :
        ct.condition_op === "<=" ? fieldValue <= ct.condition_value :
        ct.condition_op === ">"  ? fieldValue >  ct.condition_value :
        ct.condition_op === "<"  ? fieldValue <  ct.condition_value :
        false;

      if (conditionMet) {
        events.push({
          npc,
          trigger: triggerId as NpcTriggerType,
          contextHint: ct.action_hint,
        });
      }
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
  // inactive_approach는 N턴마다 재발동 가능 (한 번만 쓰고 버리지 않음)
  if (trigger === "inactive_approach") {
    // last_interaction_turn을 현재값으로 리셋하면 다음 N턴 후 다시 발동
    return state;
  }
  return { ...state, fired_triggers: [...fired, trigger] };
}

// ── 비상호작용 카운터 갱신 ────────────────────────────────────
// NPC가 타깃팅될 때 호출하여 last_interaction_turn 갱신

export function recordNpcInteraction(
  state: NpcDynamicState,
  currentTurn: number,
): NpcDynamicState {
  return { ...state, last_interaction_turn: currentTurn };
}
