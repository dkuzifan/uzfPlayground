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

  const { localId, nickname, avatarIndex } = body as {
    localId?: string;
    nickname?: string;
    avatarIndex?: number;
  };

  if (!localId || !nickname?.trim()) {
    return NextResponse.json(
      { error: "localId와 nickname은 필수입니다." },
      { status: 400 }
    );
  }
  const safeAvatarIndex = Math.min(7, Math.max(0, avatarIndex ?? 0));

  const supabase = createServiceClient();

  // 세션 존재 & waiting 상태 확인
  const { data: rawSession, error: sessionError } = await supabase
    .from("Game_Session")
    .select("id, max_players, status")
    .eq("id", sessionId)
    .single();

  if (sessionError || !rawSession) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
  }
  const session = rawSession as { id: string; max_players: number; status: string };
  if (session.status !== "waiting") {
    // 이미 시작된 방이라도 기존 멤버라면 200 OK (멱등적 처리)
    const { data: existing } = await supabase
      .from("Player_Character")
      .select("id")
      .eq("session_id", sessionId)
      .eq("user_id", localId)
      .single();
    if (existing) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "이미 시작된 방입니다." }, { status: 404 });
  }

  // 현재 인원 확인
  const { count } = await supabase
    .from("Player_Character")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if ((count ?? 0) >= session.max_players) {
    return NextResponse.json({ error: "방이 가득 찼습니다." }, { status: 409 });
  }

  // INSERT — 같은 브라우저 새로고침 시 중복(23505)은 무시
  const { error: insertError } = await supabase
    .from("Player_Character")
    .insert({
      session_id: sessionId,
      user_id: localId,
      player_name: nickname.trim(),
      character_name: nickname.trim(),
      job: "adventurer",
      personality_summary: `avatar:${safeAvatarIndex}`,
    });

  if (insertError && insertError.code !== "23505") {
    return NextResponse.json({ error: "입장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
