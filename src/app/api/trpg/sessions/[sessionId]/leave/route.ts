import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { GameSession, TurnParticipant } from "@/lib/trpg/types/game";

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

  // 플레이어 조회
  const { data: pc, error: pcError } = await supabase
    .from("Player_Character")
    .select("id, player_name, session_id")
    .eq("session_id", sessionId)
    .eq("user_id", localId)
    .single();

  if (pcError || !pc) {
    return NextResponse.json({ error: "플레이어를 찾을 수 없습니다." }, { status: 404 });
  }

  // 세션 조회
  const { data: rawSession, error: sessionError } = await supabase
    .from("Game_Session")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (sessionError || !rawSession) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
  }

  const session = rawSession as unknown as GameSession;

  // turn_order에서 제거
  const newTurnOrder: TurnParticipant[] = session.turn_order.filter((p) => p.id !== pc.id);

  // 나가는 플레이어가 현재 턴이었다면 다음 플레이어로 전진
  let nextTurnPlayerId = session.current_turn_player_id;
  if (session.current_turn_player_id === pc.id) {
    if (newTurnOrder.length === 0) {
      nextTurnPlayerId = null;
    } else {
      const currentIndex = session.turn_order.findIndex((p) => p.id === pc.id);
      const nextIndex = currentIndex % newTurnOrder.length;
      nextTurnPlayerId = newTurnOrder[nextIndex]?.id ?? null;
    }
  }

  // PC 비활성화
  await supabase
    .from("Player_Character")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", pc.id);

  // 세션 턴 오더 업데이트
  await supabase
    .from("Game_Session")
    .update({
      turn_order: newTurnOrder,
      current_turn_player_id: nextTurnPlayerId,
      turn_number: session.current_turn_player_id === pc.id
        ? session.turn_number + 1
        : session.turn_number,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  // 시스템 로그
  await supabase.from("Action_Log").insert({
    session_id: sessionId,
    turn_number: session.turn_number,
    speaker_type: "system",
    speaker_id: null,
    speaker_name: "시스템",
    action_type: "system_event",
    content: `${pc.player_name}이(가) 방을 떠났습니다.`,
    outcome: null,
    state_changes: {},
  });

  return NextResponse.json({ ok: true });
}
