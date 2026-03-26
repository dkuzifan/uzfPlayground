import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { ActiveTurnState } from "@/lib/trpg/types/game";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { session_id, player_id, local_id } = body as {
      session_id?: string;
      player_id?: string;
      local_id?: string;
    };

    if (!session_id || !player_id || !local_id) {
      return NextResponse.json({ error: "필수 파라미터가 누락됐습니다." }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 플레이어 본인 확인
    const { data: player } = await supabase
      .from("Player_Character")
      .select("id")
      .eq("id", player_id)
      .eq("user_id", local_id)
      .single();

    if (!player) return NextResponse.json({ error: "인증 실패" }, { status: 403 });

    const { data: session } = await supabase
      .from("Game_Session")
      .select("current_turn_player_id, active_turn_state")
      .eq("id", session_id)
      .single() as unknown as {
        data: { current_turn_player_id: string | null; active_turn_state: ActiveTurnState | null } | null;
      };

    if (!session) return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });

    // 자기 자신 턴엔 지원 불가
    if (session.current_turn_player_id === player_id) {
      return NextResponse.json({ error: "자신의 턴에는 지원할 수 없습니다." }, { status: 400 });
    }

    // active_turn_state가 없거나 이미 rolling이면 불가
    if (!session.active_turn_state || session.active_turn_state.status === "rolling") {
      return NextResponse.json({ error: "현재 지원을 선언할 수 없는 상태입니다." }, { status: 400 });
    }

    // 이미 지원한 플레이어는 중복 불가
    const existingIds = session.active_turn_state.assist_player_ids ?? [];
    if (existingIds.includes(player_id)) {
      return NextResponse.json({ error: "이미 지원 선언을 했습니다." }, { status: 400 });
    }

    const newCount = (session.active_turn_state.assist_count ?? 0) + 1;
    const updated: ActiveTurnState = {
      ...session.active_turn_state,
      assist_count: newCount,
      assist_player_ids: [...existingIds, player_id],
    };

    await (supabase
      .from("Game_Session")
      .update({ active_turn_state: updated as unknown as Record<string, unknown>, updated_at: new Date().toISOString() })
      .eq("id", session_id));

    return NextResponse.json({ ok: true, assist_count: newCount });
  } catch (err) {
    console.error("[game/assist]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
