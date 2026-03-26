import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { QuestTracker, ScenarioObjectives, ScenarioEndings } from "@/lib/trpg/types/game";
import type { NpcDynamicState, CharacterStats, PersonalityProfile } from "@/lib/trpg/types/character";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { sessionId } = await params;
  const supabase = createServiceClient();

  // ── 세션 조회 ─────────────────────────────────────────────────────────────
  const { data: session, error: sessionError } = await supabase
    .from("Game_Session")
    .select("id, status, turn_number, created_at, updated_at, scenario_id, quest_tracker, npc_dynamic_states, scene_phase")
    .eq("id", sessionId)
    .single() as unknown as {
      data: {
        id: string;
        status: string;
        turn_number: number;
        created_at: string;
        updated_at: string;
        scenario_id: string;
        quest_tracker: QuestTracker | null;
        npc_dynamic_states: Record<string, NpcDynamicState> | null;
        scene_phase: string | null;
      } | null;
      error: { message: string } | null;
    };

  if (sessionError || !session) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
  }

  // ── 시나리오 조회 ──────────────────────────────────────────────────────────
  const { data: scenario } = await supabase
    .from("Scenario")
    .select("title, theme, description, objectives, endings")
    .eq("id", session.scenario_id)
    .single() as unknown as {
      data: {
        title: string;
        theme: string;
        description: string | null;
        objectives: ScenarioObjectives | null;
        endings: ScenarioEndings | null;
      } | null;
    };

  // ── 플레이어 캐릭터 조회 ───────────────────────────────────────────────────
  const { data: players } = await supabase
    .from("Player_Character")
    .select("id, player_name, character_name, job, stats, personality")
    .eq("session_id", sessionId)
    .eq("is_active", true) as unknown as {
      data: {
        id: string;
        player_name: string;
        character_name: string;
        job: string;
        stats: CharacterStats;
        personality: PersonalityProfile;
      }[] | null;
    };

  // ── NPC 조회 (세션 + 시나리오 레벨) ──────────────────────────────────────
  const { data: npcs } = await supabase
    .from("NPC_Persona")
    .select("id, name, role, appearance, personality")
    .eq("scenario_id", session.scenario_id)
    .eq("is_introduced", true) as unknown as {
      data: {
        id: string;
        name: string;
        role: string;
        appearance: string;
        personality: string;
      }[] | null;
    };

  // ── 핵심 장면 조회 (최대 15개) ────────────────────────────────────────────
  const { data: keyMoments } = await supabase
    .from("Action_Log")
    .select("id, turn_number, speaker_name, speaker_type, action_type, content, outcome")
    .eq("session_id", sessionId)
    .eq("is_private", false)
    .in("action_type", ["choice", "free_input", "lore_discovery", "system_event", "gm_narration"])
    .not("outcome", "is", null)
    .order("turn_number", { ascending: true })
    .limit(15) as unknown as {
      data: {
        id: string;
        turn_number: number;
        speaker_name: string;
        speaker_type: string;
        action_type: string;
        content: string;
        outcome: string | null;
      }[] | null;
    };

  // lore_discovery (outcome 없음) 별도 조회
  const { data: loreDiscoveries } = await supabase
    .from("Action_Log")
    .select("id, turn_number, speaker_name, speaker_type, action_type, content, outcome")
    .eq("session_id", sessionId)
    .eq("is_private", false)
    .eq("action_type", "lore_discovery")
    .order("turn_number", { ascending: true })
    .limit(5) as unknown as {
      data: {
        id: string;
        turn_number: number;
        speaker_name: string;
        speaker_type: string;
        action_type: string;
        content: string;
        outcome: string | null;
      }[] | null;
    };

  // ── 글로벌 메모리 요약 ────────────────────────────────────────────────────
  const { data: globalMemory } = await supabase
    .from("Session_Memory")
    .select("summary_text, emotional_tags")
    .eq("session_id", sessionId)
    .is("npc_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single() as unknown as {
      data: {
        summary_text: string;
        emotional_tags: Record<string, number>;
      } | null;
    };

  // 핵심 장면 + lore 합치기 (턴 순 정렬)
  const allMoments = [
    ...(keyMoments ?? []),
    ...(loreDiscoveries ?? []),
  ].sort((a, b) => a.turn_number - b.turn_number);

  return NextResponse.json({
    session: {
      id: session.id,
      status: session.status,
      turn_number: session.turn_number,
      created_at: session.created_at,
      updated_at: session.updated_at,
      quest_tracker: session.quest_tracker,
      npc_dynamic_states: session.npc_dynamic_states ?? {},
      scene_phase: session.scene_phase,
    },
    scenario: scenario ?? { title: "알 수 없는 시나리오", theme: "mystery", description: null, objectives: null, endings: null },
    players: players ?? [],
    npcs: npcs ?? [],
    keyMoments: allMoments.slice(0, 20),
    globalMemory: globalMemory ?? null,
  });
}
