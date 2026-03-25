import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

type SessionWithScenario = {
  id: string;
  scenario_id: string;
  room_name: string;
  status: string;
  current_turn_player_id: string | null;
  turn_order: unknown[];
  turn_number: number;
  timeout_at: string | null;
  turn_duration_seconds: number;
  max_players: number;
  host_player_id: string | null;
  created_at: string;
  updated_at: string;
  Scenario: {
    id: string;
    title: string;
    gm_system_prompt: string;
    fixed_truths: Record<string, unknown>;
    clear_conditions: string[];
    theme: string;
    description: string | null;
    max_players: number;
    is_active: boolean;
    game_rules: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
  } | null;
};

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { sessionId } = await params;
  const supabase = createServiceClient();

  // 1. 세션 + 시나리오
  const { data, error } = (await supabase
    .from("Game_Session")
    .select("*, Scenario(*)")
    .eq("id", sessionId)
    .single()) as unknown as {
    data: SessionWithScenario | null;
    error: { message: string } | null;
  };

  if (error || !data) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
  }

  if (data.status !== "in_progress") {
    return NextResponse.json({ error: "진행 중인 세션이 아닙니다." }, { status: 403 });
  }

  const { Scenario: scenario, ...session } = data;

  // 2. 플레이어 목록
  const { data: players } = await supabase
    .from("Player_Character")
    .select("*")
    .eq("session_id", sessionId)
    .eq("is_active", true);

  // 3. 최근 로그 (30개, 오름차순)
  const { data: logs } = await supabase
    .from("Action_Log")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(30);

  // 4. NPC 공개 정보 (hidden_motivation, system_prompt 제외)
  const { data: npcRows } = await supabase
    .from("NPC_Persona")
    .select(
      "id, scenario_id, session_id, name, role, mbti, enneagram, dnd_alignment, appearance, personality, stats, resistance_stats, species_info, linguistic_profile, taste_preferences, decay_rate_negative, camaraderie_threshold, knowledge_level, created_at"
    )
    .eq("session_id", sessionId);

  return NextResponse.json({
    session,
    scenario,
    players: players ?? [],
    logs: logs ?? [],
    npcs: npcRows ?? [],
  });
}
