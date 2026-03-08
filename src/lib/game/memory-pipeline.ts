// ============================================================
// Memory Pipeline: 메모리 요약 파이프라인
// ============================================================
// action route에서 5턴마다 fire-and-forget으로 호출하거나
// /api/trpg/memory/summarize route에서 직접 호출합니다.
// ============================================================

import { createServiceClient } from "@/lib/supabase/server";
import { summarizeNpcMemory, computeDecayedEmotionLevel } from "@/lib/gemini/memory-agent";
import { computeAgeMatrix } from "./age-matrix";
import type { NpcPersona, GameSession } from "@/lib/types/game";
import type { NpcDynamicState, SpeciesInfo, TastePreference } from "@/lib/types/character";

const SUMMARY_WINDOW = 10;     // 요약 대상 최대 로그 수
const MIN_LOGS_TO_SUMMARIZE = 5; // 최소 미요약 로그 수

type RawLog = { speaker_name: string; content: string };

// 최근 로그에서 NPC 취향 키워드 첫 매칭 → 설명 텍스트 반환
function findTriggeredTasteDesc(
  recentLogs: RawLog[],
  tastePreferences: TastePreference[]
): string {
  const combinedText = recentLogs.map((l) => l.content).join(" ").toLowerCase();
  for (const taste of tastePreferences) {
    const hit = taste.trigger_keywords.some((kw) =>
      combinedText.includes(kw.toLowerCase())
    );
    if (hit) return taste.description;
  }
  return "";
}

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

function defaultSpeciesInfo(): SpeciesInfo {
  return {
    species_name: "인간",
    current_age: 25,
    expected_lifespan: 80,
    size_category: "표준형",
  };
}

export interface MemoryPipelineResult {
  session_id: string;
  summarized: boolean;
  results: Array<{ npc_id: string; npc_name: string; status: string }>;
}

export async function runMemorySummarize(
  session_id: string
): Promise<MemoryPipelineResult> {
  const supabase = createServiceClient();

  // 세션 조회
  const { data: sessionData } = (await supabase
    .from("Game_Session")
    .select("*")
    .eq("id", session_id)
    .single()) as unknown as { data: GameSession | null };

  if (!sessionData) {
    return { session_id, summarized: false, results: [] };
  }

  const currentTurn = sessionData.turn_number;
  const npcDynamicStates = (sessionData.npc_dynamic_states ?? {}) as Record<string, NpcDynamicState>;

  // NPC 목록 조회
  const { data: npcsData } = await supabase
    .from("NPC_Persona")
    .select("*")
    .eq("session_id", session_id);

  const npcs = (npcsData ?? []) as unknown as NpcPersona[];
  if (npcs.length === 0) {
    return { session_id, summarized: false, results: [] };
  }

  // 플레이어 종족 정보 (연령 인지 계산용 - 첫 번째 활성 플레이어)
  const { data: playerData } = await supabase
    .from("Player_Character")
    .select("species_info")
    .eq("session_id", session_id)
    .eq("is_active", true)
    .limit(1)
    .single();

  const playerSpeciesInfo = (playerData?.species_info ?? defaultSpeciesInfo()) as SpeciesInfo;

  const results: MemoryPipelineResult["results"] = [];

  for (const npc of npcs) {
    // 기존 NPC 기억 조회 (최근 created_at_turn 확인)
    const { data: existingMemoriesData } = await supabase
      .from("Session_Memory")
      .select("id, created_at_turn, emotional_tags, is_core_memory, decayed_emotion_level")
      .eq("session_id", session_id)
      .eq("npc_id", npc.id)
      .order("created_at_turn", { ascending: false });

    type ExistingMemory = {
      id: string;
      created_at_turn: number;
      emotional_tags: Record<string, number>;
      is_core_memory: boolean;
      decayed_emotion_level: number;
    };
    const existingMemories = (existingMemoriesData ?? []) as ExistingMemory[];
    const lastSummarizedTurn = existingMemories.length > 0 ? existingMemories[0].created_at_turn : 0;

    // 마지막 요약 이후 Action_Log 조회
    const { data: logsData } = await supabase
      .from("Action_Log")
      .select("speaker_name, speaker_type, content")
      .eq("session_id", session_id)
      .gt("turn_number", lastSummarizedTurn)
      .order("created_at", { ascending: true })
      .limit(SUMMARY_WINDOW);

    const recentLogs = (logsData ?? []) as Array<RawLog & { speaker_type: string }>;

    // 최소 로그 수 미달 → 스킵
    if (recentLogs.length < MIN_LOGS_TO_SUMMARIZE) {
      results.push({ npc_id: npc.id, npc_name: npc.name, status: "skipped_insufficient_logs" });
      continue;
    }

    // 취향 트리거 스캔
    const triggeredTasteDesc = findTriggeredTasteDesc(recentLogs, npc.taste_preferences ?? []);

    // 상대적 연령 인지
    const { agePerceptionText } = computeAgeMatrix(npc.species_info, playerSpeciesInfo);

    // NPC 현재 동적 상태
    const dynamicState: NpcDynamicState = npcDynamicStates[npc.id] ?? defaultDynamicState();

    // Gemini 요약 에이전트 호출
    let summary;
    try {
      summary = await summarizeNpcMemory({
        npcName: npc.name,
        dynamicState,
        relativeAgePerception: agePerceptionText,
        triggeredTasteDesc,
        recentLogs,
      });
    } catch {
      results.push({ npc_id: npc.id, npc_name: npc.name, status: "gemini_error" });
      continue;
    }

    // 초기 감정 강도 = emotional_tags 최대값
    const E0 = Math.max(0, ...Object.values(summary.emotional_tags));

    // Session_Memory INSERT
    await supabase.from("Session_Memory").insert({
      session_id,
      npc_id: npc.id,
      summary_text: summary.fact_summary,
      emotional_tags: summary.emotional_tags,
      is_core_memory: summary.is_core_memory,
      created_at_turn: currentTurn,
      decayed_emotion_level: E0,
      last_summarized_turn: currentTurn,
      key_facts: [],
    });

    // 기존 기억 망각 연산 배치 업데이트 (에빙하우스 감쇠)
    for (const mem of existingMemories) {
      const E0_existing = Math.max(0, ...Object.values(mem.emotional_tags));
      const deltaTurns = currentTurn - mem.created_at_turn;
      const newDecayed = computeDecayedEmotionLevel(
        E0_existing,
        npc.decay_rate_negative,
        deltaTurns,
        mem.is_core_memory
      );
      if (newDecayed !== mem.decayed_emotion_level) {
        await supabase
          .from("Session_Memory")
          .update({ decayed_emotion_level: newDecayed })
          .eq("id", mem.id);
      }
    }

    results.push({ npc_id: npc.id, npc_name: npc.name, status: "summarized" });
  }

  return { session_id, summarized: true, results };
}
