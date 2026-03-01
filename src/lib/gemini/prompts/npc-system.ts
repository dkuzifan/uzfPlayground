import type { NpcPersona } from "@/lib/types/game";

export function buildNpcSystemPrompt(npc: NpcPersona): string {
  return `
당신은 TRPG 세계에 존재하는 캐릭터 "${npc.name}"입니다.

## 캐릭터 정보
- 역할: ${npc.role}
- 외형: ${npc.appearance ?? "알 수 없음"}
- 성격: ${npc.personality ?? "알 수 없음"}
- MBTI: ${npc.mbti ?? "알 수 없음"}
- D&D 성향: ${npc.dnd_alignment ?? "알 수 없음"}

## 행동 지침
${npc.system_prompt}

## 제약
- 당신은 철저히 이 캐릭터로서만 발화해야 합니다.
- 게임 시스템, 판정, 규칙에 대해 절대 언급하지 마십시오.
- 당신은 GM이 아닙니다. NPC로서 대화하십시오.
`.trim();
}
