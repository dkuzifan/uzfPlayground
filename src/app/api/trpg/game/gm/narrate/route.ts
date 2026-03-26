import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { session_id, player_id, content } = body as {
      session_id?: string;
      player_id?: string;
      content?: string;
    };

    if (!session_id || !player_id || !content?.trim()) {
      return NextResponse.json({ error: "session_id, player_id, content는 필수입니다." }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 호스트 검증
    const { data: session } = await supabase
      .from("Game_Session")
      .select("host_player_id, turn_number")
      .eq("id", session_id)
      .single() as unknown as { data: { host_player_id: string | null; turn_number: number } | null };

    if (!session || session.host_player_id !== player_id) {
      return NextResponse.json({ error: "호스트만 사용할 수 있습니다." }, { status: 403 });
    }

    const { error } = await supabase.from("Action_Log").insert({
      session_id,
      turn_number: session.turn_number,
      speaker_type: "gm",
      speaker_id: null,
      speaker_name: "GM",
      action_type: "gm_narration",
      content: content.trim(),
      outcome: null,
      state_changes: {},
    });

    if (error) {
      console.error("[gm/narrate]", error);
      return NextResponse.json({ error: "서술 저장에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[gm/narrate]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
