import { NextRequest, NextResponse } from "next/server";
import { runMemorySummarize } from "@/lib/game/memory-pipeline";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { session_id } = body as { session_id?: string };
    if (!session_id) {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    }

    const result = await runMemorySummarize(session_id);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
