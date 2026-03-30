import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { Player, PlayerStats, PitchTypeData } from "@/lib/baseball/types/player";
import type { Database } from "@/lib/types/database";

type PlayerRow = Database["public"]["Tables"]["baseball_players"]["Row"];

export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get("team_id");

  if (!teamId) {
    return NextResponse.json({ error: "team_id is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("baseball_players")
    .select("*")
    .eq("team_id", teamId)
    .order("position_1")
    .order("number");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const players: Player[] = (data ?? []).map((_raw) => {
    const raw = _raw as unknown as PlayerRow;
    return {
      id: raw.id,
      team_id: raw.team_id,
      name: raw.name,
      number: raw.number ?? 0,
      age: raw.age ?? 0,
      bats: (raw.bats ?? "R") as Player["bats"],
      throws: (raw.throws ?? "R") as Player["throws"],
      position_1: raw.position_1 as Player["position_1"],
      position_2: (raw.position_2 ?? null) as Player["position_2"],
      position_3: (raw.position_3 ?? null) as Player["position_3"],
      stats: raw.stats as unknown as PlayerStats,
      pitch_types: (raw.pitch_types ?? []) as unknown as PitchTypeData[],
      zone_bottom: raw.zone_bottom ?? 0.5,
      zone_top: raw.zone_top ?? 1.1,
      portrait_url: raw.portrait_url ?? null,
    };
  });

  return NextResponse.json(players);
}
