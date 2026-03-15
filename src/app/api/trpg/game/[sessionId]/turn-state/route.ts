import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { ActiveTurnState } from "@/lib/types/game";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { selected_label, player_name, local_id, player_id } = body as {
    selected_label?: string;
    player_name?: string;
    local_id?: string;
    player_id?: string;
  };

  if (!local_id || !player_id) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 본인 확인
  const { data: player } = await supabase
    .from("Player_Character")
    .select("id, player_name")
    .eq("id", player_id)
    .eq("user_id", local_id)
    .single();

  if (!player) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  // active_turn_state를 "rolling" 상태로 업데이트 (choices는 기존 DB 값 보존)
  const { data: session } = await supabase
    .from("Game_Session")
    .select("active_turn_state")
    .eq("id", sessionId)
    .single();

  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const current = ((session as unknown as { active_turn_state: ActiveTurnState | null }).active_turn_state ?? {}) as Record<string, unknown>;

  await (supabase
    .from("Game_Session")
    .update({
      active_turn_state: {
        ...current,
        status: "rolling",
        selected_label: selected_label ?? current.selected_label,
        player_name: player_name ?? (player as unknown as { player_name: string }).player_name,
      },
    } as unknown as Record<string, unknown>)
    .eq("id", sessionId));

  return NextResponse.json({ ok: true });
}
