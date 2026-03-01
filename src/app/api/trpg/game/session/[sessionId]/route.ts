import { NextRequest, NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

// GET /api/trpg/game/session/[sessionId] - 세션 조회
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { sessionId } = await params;

  try {
    // TODO: Supabase에서 세션 조회 로직 구현
    return NextResponse.json({ session: null, sessionId });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/trpg/game/session/[sessionId] - 세션 상태 업데이트
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { sessionId } = await params;

  try {
    const body = await req.json();
    // TODO: 세션 업데이트 로직 구현
    return NextResponse.json({ session: null, sessionId, updates: body });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
