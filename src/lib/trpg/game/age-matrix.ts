// ============================================================
// Age Matrix: 상대적 연령 인지 텍스트 생성
// ============================================================
// NPC와 플레이어의 종족별 생애주기 비율을 비교하여
// NPC가 플레이어를 어떻게 인지하는지 텍스트로 반환합니다.
//
// 핵심 공식: 생애주기 비율 = current_age / expected_lifespan
// 단순 나이 수치가 아닌 '삶에서 얼마나 왔는가'를 비교합니다.
// ============================================================

import type { SpeciesInfo, SizeCategory } from "@/lib/trpg/types/character";

// 생애주기 단계 (비율 기준)
type LifeStage = "유아기" | "청소년기" | "청년기" | "중년기" | "노년기" | "초고령기";

function getLifeStage(ratio: number): LifeStage {
  if (ratio < 0.1) return "유아기";
  if (ratio < 0.25) return "청소년기";
  if (ratio < 0.5) return "청년기";
  if (ratio < 0.75) return "중년기";
  if (ratio < 0.9) return "노년기";
  return "초고령기";
}

// 생애주기 비율 차이 → NPC가 플레이어를 인식하는 태도 텍스트
function buildAgePerceptionText(
  npcRatio: number,
  playerRatio: number,
  npcSpecies: string,
  playerSpecies: string,
  npcAge: number,
  playerAge: number
): string {
  const diff = npcRatio - playerRatio;
  const npcStage = getLifeStage(npcRatio);
  const playerStage = getLifeStage(playerRatio);

  // NPC가 플레이어보다 생애주기상 훨씬 앞서 있는 경우 (0.3 이상 차이)
  if (diff >= 0.5) {
    return `당신(${npcSpecies}, ${npcAge}세, ${npcStage})은 플레이어(${playerSpecies}, ${playerAge}세)를 덧없이 짧게 사는 어린 존재로 여깁니다. 귀여워하거나 약간 무시하는 시선으로 대하되, 그들의 짧은 생애에 묘한 연민을 느낍니다.`;
  }
  if (diff >= 0.3) {
    return `당신(${npcSpecies}, ${npcAge}세, ${npcStage})은 플레이어(${playerSpecies}, ${playerAge}세, ${playerStage})보다 인생 경험이 훨씬 풍부합니다. 약간 위에서 내려다보는 시선으로 대하나, 그들의 패기를 인정하는 면도 있습니다.`;
  }
  if (diff >= 0.15) {
    return `당신(${npcSpecies}, ${npcAge}세)은 플레이어(${playerSpecies}, ${playerAge}세)보다 인생 경험이 더 많습니다. 선배 혹은 연장자로서 자연스럽게 대화를 이끌려 합니다.`;
  }

  // 플레이어가 생애주기상 훨씬 앞서 있는 경우
  if (diff <= -0.5) {
    return `당신(${npcSpecies}, ${npcAge}세, ${npcStage})은 플레이어(${playerSpecies}, ${playerAge}세)가 자신보다 훨씬 오래 살아온 존재임을 압니다. 경외감 혹은 열등감을 느끼며, 그들의 말에 은연중 무게를 더 둡니다.`;
  }
  if (diff <= -0.3) {
    return `당신(${npcSpecies}, ${npcAge}세)은 플레이어(${playerSpecies}, ${playerAge}세)의 풍부한 경험 앞에 약간의 주눅을 느낍니다. 겉으로는 표내지 않으려 하지만 속으로는 의식하고 있습니다.`;
  }
  if (diff <= -0.15) {
    return `당신(${npcSpecies}, ${npcAge}세)은 플레이어(${playerSpecies}, ${playerAge}세)를 자신보다 인생 경험이 더 많은 사람으로 인식합니다. 자연스럽게 후배처럼 대하게 됩니다.`;
  }

  // 비슷한 생애주기 (±0.15 이내)
  return `당신(${npcSpecies}, ${npcAge}세)과 플레이어(${playerSpecies}, ${playerAge}세)는 비슷한 삶의 단계에 있습니다. 동년배처럼 편하게 대화할 수 있습니다.`;
}

// 신장 카테고리 기반 위압감/위축감 텍스트
function buildSizePerceptionText(
  npcSize: SizeCategory,
  playerSize: SizeCategory
): string | null {
  const sizeOrder: Record<SizeCategory, number> = {
    소형종: 0,
    표준형: 1,
    대형종: 2,
    거대형: 3,
  };

  const diff = sizeOrder[npcSize] - sizeOrder[playerSize];

  if (diff >= 2) return `당신은 플레이어보다 훨씬 거대한 체구를 가지고 있습니다. 플레이어를 내려다보며 자연스러운 위압감을 줍니다.`;
  if (diff === 1) return `당신은 플레이어보다 체구가 큽니다. 물리적 존재감에서 약간의 우위를 점합니다.`;
  if (diff === -1) return `당신은 플레이어보다 체구가 작습니다. 위협적인 상황에서 본능적으로 위축감을 느낄 수 있습니다.`;
  if (diff <= -2) return `당신은 플레이어에 비해 매우 작은 체구입니다. 플레이어의 물리적 위압감을 항상 의식합니다.`;

  return null; // 같은 카테고리면 별도 언급 불필요
}

// ── 메인 함수 ────────────────────────────────────────────────

export interface AgeMatrixResult {
  agePerceptionText: string;
  sizePerceptionText: string | null;
}

export function computeAgeMatrix(
  npcSpecies: SpeciesInfo,
  playerSpecies: SpeciesInfo
): AgeMatrixResult {
  const npcRatio = npcSpecies.current_age / npcSpecies.expected_lifespan;
  const playerRatio = playerSpecies.current_age / playerSpecies.expected_lifespan;

  return {
    agePerceptionText: buildAgePerceptionText(
      npcRatio,
      playerRatio,
      npcSpecies.species_name,
      playerSpecies.species_name,
      npcSpecies.current_age,
      playerSpecies.current_age
    ),
    sizePerceptionText: buildSizePerceptionText(
      npcSpecies.size_category,
      playerSpecies.size_category
    ),
  };
}
