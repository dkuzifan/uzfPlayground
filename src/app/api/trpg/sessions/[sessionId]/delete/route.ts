import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { GameSession } from "@/lib/trpg/types/game";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { sessionId } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { localId } = body as { localId?: string };
  if (!localId) return NextResponse.json({ error: "localId는 필수입니다." }, { status: 400 });

  const supabase = createServiceClient();

  // 요청자 PC 조회
  const { data: pc, error: pcError } = await supabase
    .from("Player_Character")
    .select("id")
    .eq("session_id", sessionId)
    .eq("user_id", localId)
    .single();

  if (pcError || !pc) {
    return NextResponse.json({ error: "플레이어를 찾을 수 없습니다." }, { status: 404 });
  }

  // 방장 권한 확인
  const { data: rawSession, error: sessionError } = await supabase
    .from("Game_Session")
    .select("host_player_id, turn_number")
    .eq("id", sessionId)
    .single();

  if (sessionError || !rawSession) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
  }

  const session = rawSession as unknown as Pick<GameSession, "host_player_id" | "turn_number">;

  if (session.host_player_id !== pc.id) {
    return NextResponse.json({ error: "방장만 방을 제거할 수 있습니다." }, { status: 403 });
  }

  // 시스템 로그 먼저 삽입 (Realtime 구독자들이 볼 수 있도록)
  await supabase.from("Action_Log").insert({
    session_id: sessionId,
    turn_number: session.turn_number,
    speaker_type: "system",
    speaker_id: null,
    speaker_name: "시스템",
    action_type: "system_event",
    content: "방장이 방을 제거했습니다.",
    outcome: null,
    state_changes: {},
  });

  // 세션 상태를 abandoned로 변경 → Realtime으로 모든 클라이언트에 전파
  await supabase
    .from("Game_Session")
    .update({
      status: "abandoned",
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  return NextResponse.json({ ok: true });
}
