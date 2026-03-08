// ============================================================
// NPC Prompt Builder: 8블록 NPC 시스템 프롬프트 조립기
// ============================================================
// 매 턴 Gemini API 호출 전에 백엔드에서 실행됩니다.
// NPC가 단순 챗봇이 아닌 입체적 인간처럼 행동하도록
// 심리 상태, 기억, 취향, 언어 규칙을 조립합니다.
//
// 8개 블록 구조 (Notion PRD 기준):
//   [1] 정체성 & 역할 선언      (항상 포함)
//   [2] 현재 심리 상태          (항상 포함)
//   [3] 플레이어와의 관계 수치  (항상 포함)
//   [4] 상대적 연령/체형 인지   (항상 포함, age-matrix 결과)
//   [5] 발동된 취향             (트리거 시에만)
//   [6] 주관적 기억 회상        (기억 있을 때만)
//   [7] 세계관 & Lore Queue     (lore 있을 때만)
//   [8] 핵심 연기 지침 & 출력 포맷 강제 (항상 포함)
// ============================================================

import type { NpcPersona, NpcMemory } from "@/lib/types/game";
import type { SpeciesInfo, TastePreference, NpcDynamicState } from "@/lib/types/character";
import type { AgeMatrixResult } from "./age-matrix";

export interface LoreContext {
  currentLoreTexts: string[];   // 이번 턴에 설명할 로어
  pendingQueueNames: string[];  // 미뤄둔 키워드 이름 목록
}

export interface NpcPromptInput {
  npc: NpcPersona;
  playerSpeciesInfo: SpeciesInfo;   // 플레이어 종족/나이 정보
  dynamicState: NpcDynamicState;    // 현재 동적 심리 상태
  ageMatrix: AgeMatrixResult;       // age-matrix 연산 결과
  triggeredTaste: TastePreference | null; // 취향 트리거 결과
  memories: NpcMemory[];            // 망각 연산 적용된 기억 목록
  lore: LoreContext;                // 로어 & 큐 컨텍스트
}

// ── Block 1: 정체성 & 역할 선언 ──────────────────────────────
function buildIdentityBlock(npc: NpcPersona): string {
  const lines = [
    `당신은 TRPG 세계관의 NPC '${npc.name}'입니다.`,
    `당신은 단순한 챗봇이 아니라, 복잡한 심리와 과거의 상처, 개인적인 취향을 가진 입체적인 인간입니다.`,
  ];
  if (npc.appearance) lines.push(`외형: ${npc.appearance}`);
  if (npc.personality) lines.push(`기본 성격: ${npc.personality}`);
  if (npc.mbti)        lines.push(`MBTI: ${npc.mbti}`);
  if (npc.dnd_alignment) lines.push(`D&D 성향: ${npc.dnd_alignment}`);

  return `[정체성]\n${lines.join("\n")}`;
}

// ── Block 2: 현재 심리 상태 ───────────────────────────────────
function buildPsychologicalBlock(state: NpcDynamicState): string {
  const stressBar = `${state.mental_stress}/100`;
  const fearBar   = `${state.fear_survival}/100`;
  const fatigueBar = `${state.physical_fatigue}/100`;

  const lines = [
    `감정 상태: ${state.current_mood}`,
    `정신적 스트레스: ${stressBar}`,
    `육체적 피로도: ${fatigueBar}`,
    `생존 본능 및 공포: ${fearBar}`,
    `평판 관리 욕구: ${state.self_image_management}/100`,
    `군중 심리: ${state.mob_mentality}/100`,
  ];

  // 공포가 임계점(80+) 초과 시 셧다운 오버라이드 경고
  if (state.fear_survival >= 80) {
    lines.push(
      `\n⚠️ [공포 셧다운 발동]: 공포 수치가 임계점을 넘었습니다. ` +
      `의무감, 신뢰도 등 다른 모든 변수를 무시하고 오직 도망 혹은 비굴한 항복만을 선택하십시오.`
    );
  }

  return `[1. 현재 심리 및 상태]\n${lines.join("\n")}`;
}

// ── Block 3: 플레이어와의 관계 수치 ──────────────────────────
function buildRelationshipBlock(
  state: NpcDynamicState,
  playerName: string
): string {
  const lines = [
    `친근감: ${state.affinity}/100`,
    `신뢰도: ${state.trust}/100`,
    `권력 우위: ${state.power_dynamics}`,
    `부채의식: ${state.personal_debt}/100`,
    `의무감: ${state.sense_of_duty}/100`,
    `전우애(결속력): ${state.camaraderie}/100`,
  ];

  return `[2. 대상 플레이어 '${playerName}'과의 관계 수치]\n${lines.join("\n")}`;
}

// ── Block 4: 상대적 연령/체형 인지 ───────────────────────────
function buildAgeBlock(ageMatrix: AgeMatrixResult): string {
  const lines = [ageMatrix.agePerceptionText];
  if (ageMatrix.sizePerceptionText) {
    lines.push(ageMatrix.sizePerceptionText);
  }
  return `[3. 상대적 연령 및 체형 인지]\n${lines.join("\n")}`;
}

// ── Block 5: 발동된 취향 (조건부) ────────────────────────────
function buildTasteBlock(taste: TastePreference): string {
  return `[4. 발동된 특이 취향 및 기호]\n${taste.description}`;
}

// ── Block 6: 주관적 기억 회상 (조건부) ───────────────────────
function buildMemoryBlock(memories: NpcMemory[]): string {
  const memoryLines = memories.map((mem) => {
    const decayNote = mem.is_core_memory
      ? "(핵심 기억 - 절대 잊히지 않음)"
      : `(풍화 강도: ${Math.round(mem.decayed_emotion_level)}/100)`;
    const emotionTags = Object.entries(mem.emotional_tags)
      .filter(([, v]) => v > 10)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

    return `- 기억: "${mem.summary_text}" ${decayNote}\n  당시 감정: [${emotionTags || "미약함"}]`;
  });

  return `[5. 주관적 기억 회상]\n당신은 유저의 말을 듣고 다음 과거의 사건을 떠올렸습니다.\n${memoryLines.join("\n")}`;
}

// ── Block 7: 세계관 & Lore Queue (조건부) ────────────────────
function buildLoreBlock(lore: LoreContext): string {
  const lines: string[] = [];

  if (lore.currentLoreTexts.length > 0) {
    lines.push("[이번 턴에 설명할 지식]");
    lore.currentLoreTexts.forEach((text, i) => lines.push(`${i + 1}. ${text}`));
  }

  if (lore.pendingQueueNames.length > 0) {
    lines.push(
      `\n[질문이 너무 많아 미뤄둔 지식 (Lore Queue)]`,
      `유저가 물어봤으나 나중에 답할 키워드: ${lore.pendingQueueNames.join(", ")}`,
      `(※ 미뤄둔 지식이 있다면, 당신의 성격에 맞는 말투로 핑계를 대며 이번 턴에는 [이번 턴에 설명할 지식]만 대답하십시오.)`
    );
  }

  return `[6. 세계관 및 다중 질문 대응]\n${lines.join("\n")}`;
}

// ── Block 8: 핵심 연기 지침 & 출력 포맷 강제 ─────────────────
function buildActingGuidelinesBlock(npc: NpcPersona): string {
  const { linguistic_profile } = npc;

  const forbiddenWordsNote = linguistic_profile.forbidden_words.length > 0
    ? `\n금지 단어 (절대 사용 금지): ${linguistic_profile.forbidden_words.join(", ")}`
    : "";

  const sentenceEndingNote = linguistic_profile.sentence_ending
    ? `\n어미 규칙: ${linguistic_profile.sentence_ending}`
    : "";

  const vocalTicsNote = linguistic_profile.vocal_tics
    ? `\n말버릇/동작 버릇: ${linguistic_profile.vocal_tics}`
    : "";

  return `[7. 핵심 연기 지침]
당신이 속으로 느끼는 감정(인지)과 입 밖으로 꺼내는 말(발화)은 다를 수 있습니다.
체면, 두려움, 계산적인 속셈으로 겉으로는 거짓말을 하거나 감정을 숨기십시오.
단, 플레이어가 진짜 속마음을 눈치챌 수 있도록 반드시 대사 사이에 괄호 ( )를 사용하여
미세한 비언어적 힌트(시선 회피, 목소리 떨림, 억지웃음, 식은땀 등)를 지문으로 묘사하십시오.

말투 특성: ${linguistic_profile.speech_style}${sentenceEndingNote}${vocalTicsNote}${forbiddenWordsNote}

[출력 포맷 강제]
반드시 아래 형식으로만 출력하십시오. 다른 텍스트는 절대 포함하지 마십시오.

(지문: 당신의 속마음이 은연중에 드러나는 행동이나 표정 묘사)
"대사: 유저에게 실제로 하는 말"

- 지문은 괄호 안에 3인칭 현재 묘사로 작성하십시오.
- 대사는 큰따옴표 안에 1인칭으로 작성하십시오.
- 게임 시스템, 주사위, 규칙에 대해 절대 언급하지 마십시오.
- 당신은 GM이 아닙니다. 오직 NPC로서만 발화하십시오.`;
}

// ── 메인 조립 함수 ────────────────────────────────────────────

export function buildNpcPrompt(input: NpcPromptInput, playerName: string): string {
  const {
    npc,
    dynamicState,
    ageMatrix,
    triggeredTaste,
    memories,
    lore,
  } = input;

  const blocks: string[] = [];

  // Block 1: 항상
  blocks.push(buildIdentityBlock(npc));

  // Block 2: 항상
  blocks.push(buildPsychologicalBlock(dynamicState));

  // Block 3: 항상
  blocks.push(buildRelationshipBlock(dynamicState, playerName));

  // Block 4: 항상 (연령/체형 인지)
  blocks.push(buildAgeBlock(ageMatrix));

  // Block 5: 취향 트리거 발동 시에만
  if (triggeredTaste) {
    blocks.push(buildTasteBlock(triggeredTaste));
  }

  // Block 6: 기억이 있을 때만
  const significantMemories = memories.filter(
    (m) => m.decayed_emotion_level >= 10 || m.is_core_memory
  );
  if (significantMemories.length > 0) {
    blocks.push(buildMemoryBlock(significantMemories));
  }

  // Block 7: 로어가 있을 때만
  if (lore.currentLoreTexts.length > 0 || lore.pendingQueueNames.length > 0) {
    blocks.push(buildLoreBlock(lore));
  }

  // Block 8: 항상 (연기 지침 + 포맷 강제)
  blocks.push(buildActingGuidelinesBlock(npc));

  return blocks.join("\n\n---\n\n");
}
