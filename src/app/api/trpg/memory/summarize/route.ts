import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { session_id } = body;

    if (!session_id) {
      return NextResponse.json(
        { error: "Missing session_id" },
        { status: 400 }
      );
    }

    // TODO: Action_Log 조회 → Gemini 요약 → Session_Memory 업데이트 로직 구현
    return NextResponse.json({ session_id, summarized: false });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
