import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { session_id, player_id, action_type, content } = body;

    if (!session_id || !player_id || !action_type || !content) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // TODO: GM 에이전트 호출 및 판정 로직 구현
    return NextResponse.json({ message: "Action received", status: "pending" });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
