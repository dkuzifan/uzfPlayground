import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

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
    .select("id, host_player_id, status")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
  }
  if (session.host_player_id !== pc.id) {
    return NextResponse.json({ error: "방장만 게임을 시작할 수 있습니다." }, { status: 403 });
  }

  // status → in_progress
  const { error: updateError } = await supabase
    .from("Game_Session")
    .update({ status: "in_progress" })
    .eq("id", sessionId);

  if (updateError) {
    return NextResponse.json({ error: "게임 시작에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
