import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { Team, Player, PlayerStats, PitchTypeData } from "@/lib/baseball/types/player";
import type { Database } from "@/lib/types/database";

type TeamRow = Database["public"]["Tables"]["baseball_teams"]["Row"];
type PlayerRow = Database["public"]["Tables"]["baseball_players"]["Row"];

export async function GET() {
  const supabase = createServiceClient();

  const { data: teams, error: teamsError } = await supabase
    .from("baseball_teams")
    .select("*")
    .order("name");

  if (teamsError) {
    return NextResponse.json({ error: teamsError.message }, { status: 500 });
  }

  const { data: players, error: playersError } = await supabase
    .from("baseball_players")
    .select("*");

  if (playersError) {
    return NextResponse.json({ error: playersError.message }, { status: 500 });
  }

  const playersByTeam = (players ?? []).reduce<Record<string, Player[]>>((acc, _raw) => {
    const raw = _raw as unknown as PlayerRow;
    const player: Player = {
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

    if (!acc[raw.team_id]) acc[raw.team_id] = [];
    acc[raw.team_id].push(player);
    return acc;
  }, {});

  const result: Team[] = (teams ?? []).map((_t) => {
    const t = _t as unknown as TeamRow;
    return {
      id: t.id,
      name: t.name,
      short_name: t.short_name,
      primary_color: t.primary_color ?? "",
      players: playersByTeam[t.id] ?? [],
    };
  });

  return NextResponse.json(result);
}
