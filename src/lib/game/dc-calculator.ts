// ============================================================
// DC Calculator: NPC resistance_stats 기반 Deterministic DC 산출
// ============================================================
// System GM의 주사위 판정 DC를 AI hallucination 없이 결정합니다.
// DC = NPC의 resistance_stats 값을 직접 사용하며,
// AI는 판정 필요 여부와 행동 분류(ActionCategory)만 결정합니다.
// ============================================================

import type { ResistanceStats } from "@/lib/types/character";

// AI가 분류하는 행동 카테고리 (taste-modifier-engine.ts의 actionType과 1:1 대응)
export type ActionCategory =
  | "attack"    // 물리적 공격 → physical_defense DC
  | "threaten"  // 위협/협박 → physical_defense DC
  | "persuade"  // 설득/유혹/협상 → mental_willpower DC
  | "deceive"   // 속임/거짓말/변장 → perception DC
  | "gift"      // 선물/호의 → 판정 없음 (감정 변화만)
  | "stealth"   // 은신/잠입 → perception DC
  | "none";     // 일반 대화/이동 → 판정 없음

// NPC resistance_stats 기반 deterministic DC 계산
// 반환값이 null이면 판정 불필요 (category = gift | none)
export function computeDCFromCategory(
  category: ActionCategory,
  resistance: ResistanceStats
): number | null {
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
      return null;
  }
}

// NPC v2 데이터 없을 때 폴백 (구식 NPC 또는 DB 마이그레이션 전 데이터)
export function defaultResistanceStats(): ResistanceStats {
  return {
    physical_defense: 13,
    mental_willpower: 12,
    perception: 11,
  };
}
