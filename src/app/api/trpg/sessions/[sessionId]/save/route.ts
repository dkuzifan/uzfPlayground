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
    .select("*")
    .eq("id", sessionId)
    .single();

  if (sessionError || !rawSession) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
  }

  const session = rawSession as unknown as GameSession;

  if (session.host_player_id !== pc.id) {
    return NextResponse.json({ error: "방장만 저장할 수 있습니다." }, { status: 403 });
  }

  // 최근 로그 및 플레이어 정보 수집
  const [{ data: logs }, { data: players }] = await Promise.all([
    supabase
      .from("Action_Log")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
    supabase
      .from("Player_Character")
      .select("id, player_name, character_name, job, stats, is_active")
      .eq("session_id", sessionId),
  ]);

  const savedAt = new Date().toISOString();

  const summaryText = JSON.stringify({
    saved_at: savedAt,
    session: {
      id: session.id,
      room_name: session.room_name,
      turn_number: session.turn_number,
      status: session.status,
    },
    players: players ?? [],
    log_count: (logs ?? []).length,
  });

  const keyFacts = (players ?? []).map(
    (p) => `${p.player_name}(${p.job}) HP:${(p.stats as { hp: number }).hp}`
  );

  // Session_Memory upsert
  await supabase.from("Session_Memory").upsert(
    {
      session_id: sessionId,
      summary_text: summaryText,
      last_summarized_turn: session.turn_number,
      key_facts: keyFacts,
      updated_at: savedAt,
    },
    { onConflict: "session_id" }
  );

  return NextResponse.json({ ok: true, saved_at: savedAt });
}
