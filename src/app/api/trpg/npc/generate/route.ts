import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scenario_id, session_id, role } = body;

    if (!scenario_id || !role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // TODO: Gemini API를 사용한 NPC 프로필 자동 생성 로직 구현
    return NextResponse.json({ npc: null, scenario_id, session_id, role });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
