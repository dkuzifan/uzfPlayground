import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getNextTurn } from "@/lib/trpg/game/turn-manager";
import type { GameSession } from "@/lib/trpg/types/game";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { session_id, player_id } = body as {
      session_id?: string;
      player_id?: string;
    };

    if (!session_id || !player_id) {
      return NextResponse.json({ error: "session_id, player_id는 필수입니다." }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: session } = await supabase
      .from("Game_Session")
      .select("host_player_id, current_turn_player_id, turn_order, turn_number, status")
      .eq("id", session_id)
      .single() as unknown as { data: GameSession | null };

    if (!session) {
      return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
    }
    if (session.host_player_id !== player_id) {
      return NextResponse.json({ error: "호스트만 사용할 수 있습니다." }, { status: 403 });
    }
    if (session.status !== "in_progress") {
      return NextResponse.json({ error: "진행 중인 세션이 아닙니다." }, { status: 400 });
    }

    const nextTurn = getNextTurn(session);
    const skippedPlayerId = session.current_turn_player_id;

    // 건너뜀 로그 삽입
    await supabase.from("Action_Log").insert({
      session_id,
      turn_number: session.turn_number,
      speaker_type: "system",
      speaker_id: null,
      speaker_name: "시스템",
      action_type: "system_event",
      content: "GM이 턴을 건너뛰었습니다.",
      outcome: null,
      state_changes: { skipped_player_id: skippedPlayerId },
    });

    const { error } = await supabase
      .from("Game_Session")
      .update({
        current_turn_player_id: nextTurn?.id ?? null,
        turn_number: session.turn_number + 1,
        active_turn_state: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    if (error) {
      console.error("[gm/skip-turn]", error);
      return NextResponse.json({ error: "턴 진행에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, next_player_id: nextTurn?.id ?? null });
  } catch (err) {
    console.error("[gm/skip-turn]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
