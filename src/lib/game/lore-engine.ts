// ============================================================
// Lore Engine: 월드 인포 동적 호출 파이프라인
// ============================================================
// 유저 입력에서 키워드를 스캔하여 NPC가 알 권한이 있는
// 세계관/개인사 지식을 추출하고 토큰 방어를 적용합니다.
//
// 4단계 파이프라인:
//   Step 1: 텍스트 스캔 + 권한 검증 (Access Control)
//   Step 2: 태그 군집화 (Clustering)
//   Step 3: 토큰 방어 + Lore Queue 분리
//   Step 4: LoreContext 반환 (npc-prompt-builder에서 소비)
// ============================================================

import type { LoreContext } from "./npc-prompt-builder";

export interface WorldDictionaryEntry {
  id: string;
  scenario_id: string;
  domain: "WORLD_LORE" | "PERSONAL_LORE";
  category: string;
  owner_npc_id: string | null;
  trigger_keywords: string[];
  cluster_tags: string[];
  lore_text: string;
  importance_weight: number;
  required_access_level: number;
}

// 한 턴에 허용되는 최대 로어 텍스트 글자 수
const TOKEN_CAP_CHARS = 300;

export interface LoreExtractionResult {
  loreContext: LoreContext;
  updatedPendingQueue: string[];
}

export function scanAndExtractLore(params: {
  playerText: string;
  npcKnowledgeLevel: number; // WORLD_LORE 접근 레벨 기준
  npcTrust: number;          // PERSONAL_LORE 접근 기준 (신뢰도 -100~100 → 0~100 정규화)
  loreEntries: WorldDictionaryEntry[];
  pendingQueue: string[];    // 이전 턴에서 미뤄둔 키워드 목록
}): LoreExtractionResult {
  const { playerText, npcKnowledgeLevel, npcTrust, loreEntries, pendingQueue } = params;
  const lowerText = playerText.toLowerCase();

  // ── Step 1: 키워드 스캔 + 권한 검증 ────────────────────────
  const matched: WorldDictionaryEntry[] = [];

  for (const entry of loreEntries) {
    const hasKeywordMatch = entry.trigger_keywords.some((kw) =>
      lowerText.includes(kw.toLowerCase())
    );
    if (!hasKeywordMatch) continue;

    // 권한 검증
    if (entry.domain === "WORLD_LORE") {
      // 지식 레벨 부족 → 영구 탈락 (큐에도 넣지 않음)
      if (npcKnowledgeLevel < entry.required_access_level) continue;
    } else {
      // PERSONAL_LORE: 신뢰도 기반 (trust -100~100을 0~100으로 정규화)
      const normalizedTrust = Math.round((npcTrust + 100) / 2);
      if (normalizedTrust < entry.required_access_level * 10) continue;
    }

    matched.push(entry);
  }

  if (matched.length === 0) {
    return {
      loreContext: { currentLoreTexts: [], pendingQueueNames: pendingQueue },
      updatedPendingQueue: pendingQueue,
    };
  }

  // ── Step 2: 태그 군집화 ──────────────────────────────────────
  // importance_weight 내림차순 정렬
  matched.sort((a, b) => b.importance_weight - a.importance_weight);

  const groups: WorldDictionaryEntry[][] = [];
  const assigned = new Set<string>();

  for (const entry of matched) {
    if (assigned.has(entry.id)) continue;
    const group: WorldDictionaryEntry[] = [entry];
    assigned.add(entry.id);

    // 교집합 cluster_tags가 있는 다른 항목 탐색
    for (const other of matched) {
      if (assigned.has(other.id)) continue;
      const hasCommonTag = entry.cluster_tags.some((tag) =>
        other.cluster_tags.includes(tag)
      );
      if (hasCommonTag) {
        group.push(other);
        assigned.add(other.id);
      }
    }
    groups.push(group);
  }

  // ── Step 3: 토큰 방어 + Queue 분리 ──────────────────────────
  // 가장 중요한 첫 번째 그룹만 이번 턴에 설명
  const thisGroupEntries = groups[0] ?? [];
  const otherGroups = groups.slice(1);

  const currentLoreTexts: string[] = [];
  let charCount = 0;

  for (const entry of thisGroupEntries) {
    const text = `[${entry.category}] ${entry.lore_text}`;
    if (charCount + text.length > TOKEN_CAP_CHARS) break;
    currentLoreTexts.push(text);
    charCount += text.length;
  }

  // 미뤄둔 그룹 → category 이름만 큐에 저장 (텍스트 내용은 제외)
  const newPendingNames = otherGroups
    .flatMap((g) => g)
    .map((e) => e.category);

  const updatedPendingQueue = [...new Set([...pendingQueue, ...newPendingNames])];

  return {
    loreContext: {
      currentLoreTexts,
      pendingQueueNames: updatedPendingQueue,
    },
    updatedPendingQueue,
  };
}
