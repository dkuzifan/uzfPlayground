import { NextRequest, NextResponse } from "next/server";

// POST /api/trpg/game/session - 세션 생성
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scenario_id, room_name, host_player_id, max_players } = body;

    if (!scenario_id || !room_name || !host_player_id) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // TODO: Supabase에 Game_Session 생성 로직 구현
    return NextResponse.json({ session: null }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/trpg/game/session - 세션 목록 조회
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "waiting";

    // TODO: Supabase에서 세션 목록 조회 로직 구현
    return NextResponse.json({ sessions: [], status });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
