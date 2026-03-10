import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// ── GET /api/trpg/scenarios — 활성 시나리오 목록 ─────────────────────
export async function GET() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("Scenario")
    .select("id, title, theme, description, max_players, character_creation_config")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GET /api/trpg/scenarios]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
