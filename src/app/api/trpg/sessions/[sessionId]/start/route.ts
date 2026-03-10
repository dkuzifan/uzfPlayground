import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { buildTurnOrder } from "@/lib/game/turn-manager";
import { generateOpeningNarration } from "@/lib/gemini/gm-agent";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { sessionId } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { localId } = body as { localId?: string };
  if (!localId) {
    return NextResponse.json({ error: "localId는 필수입니다." }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 요청자의 Player_Character 조회
  const { data: pc, error: pcError } = await supabase
    .from("Player_Character")
    .select("id")
    .eq("session_id", sessionId)
    .eq("user_id", localId)
    .single();

  if (pcError || !pc) {
    return NextResponse.json({ error: "참여자를 찾을 수 없습니다." }, { status: 404 });
  }

  // 세션의 host_player_id와 비교
  const { data: session, error: sessionError } = await supabase
    .from("Game_Session")
    .select("id, host_player_id, status, scenario_id")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
  }
  if (session.host_player_id !== pc.id) {
    return NextResponse.json({ error: "방장만 게임을 시작할 수 있습니다." }, { status: 403 });
  }

  // 참여 중인 플레이어 목록 조회 → turn_order 구성
  const { data: pcs } = await supabase
    .from("Player_Character")
    .select("id")
    .eq("session_id", sessionId)
    .eq("is_active", true);

  const playerIds = (pcs ?? []).map((p) => p.id);
  const turnOrder = buildTurnOrder(playerIds, []);
  const firstTurnPlayerId = turnOrder[0]?.id ?? null;

  // status → in_progress + turn_order + current_turn_player_id 초기화
  const { error: updateError } = await supabase
    .from("Game_Session")
    .update({
      status: "in_progress",
      turn_order: turnOrder,
      current_turn_player_id: firstTurnPlayerId,
      turn_number: 1,
    })
    .eq("id", sessionId);

  if (updateError) {
    console.error("[start] update error:", updateError);
    return NextResponse.json({ error: "게임 시작에 실패했습니다.", detail: updateError.message }, { status: 500 });
  }

  // 오프닝 서사 생성 (비동기 — 실패해도 게임 시작은 이미 완료)
  try {
    const [{ data: scenarioData }, { data: playerList }] = await Promise.all([
      supabase
        .from("Scenario")
        .select("gm_system_prompt")
        .eq("id", (session as { scenario_id?: string }).scenario_id ?? "")
        .single(),
      supabase
        .from("Player_Character")
        .select("player_name")
        .eq("session_id", sessionId)
        .eq("is_active", true),
    ]);

    const prompt = scenarioData?.gm_system_prompt ?? "당신은 TRPG 게임 마스터입니다.";
    const names = (playerList ?? []).map((p) => p.player_name);
    const opening = await generateOpeningNarration(prompt, names);

    await supabase.from("Action_Log").insert({
      session_id: sessionId,
      turn_number: 0,
      speaker_type: "gm",
      speaker_id: null,
      speaker_name: "GM",
      action_type: "gm_narration",
      content: opening,
      outcome: null,
      state_changes: {},
    });
  } catch (e) {
    console.error("[start] opening narration failed:", e);
  }

  return NextResponse.json({ ok: true });
}
