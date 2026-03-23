import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { ScenarioObjectives, ScenarioEndings, CharacterConfig } from "@/lib/trpg/types/game";
import type { LoreItemInput } from "../generate-lore/route";

interface RouteParams {
  params: Promise<{ scenarioId: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { scenarioId } = await params;
  const supabase = createServiceClient();

  const { data: scenario, error } = await supabase
    .from("Scenario")
    .select(
      "id, title, theme, description, max_players, gm_system_prompt, character_creation_config, objectives, endings, character_config"
    )
    .eq("id", scenarioId)
    .eq("is_active", true)
    .single() as unknown as {
      data: {
        id: string;
        title: string;
        theme: string;
        description: string | null;
        max_players: number;
        gm_system_prompt: string;
        character_creation_config: Record<string, unknown>;
        objectives: ScenarioObjectives | null;
        endings: ScenarioEndings | null;
        character_config: CharacterConfig | null;
      } | null;
      error: { message: string } | null;
    };

  if (error || !scenario) {
    return NextResponse.json({ error: "시나리오를 찾을 수 없습니다." }, { status: 404 });
  }

  // Lore 항목 조회
  const { data: loreItems } = await supabase
    .from("World_Dictionary")
    .select("domain, category, lore_text, trigger_keywords, cluster_tags, importance_weight, required_access_level")
    .eq("scenario_id", scenarioId)
    .order("importance_weight", { ascending: false }) as unknown as {
      data: LoreItemInput[] | null;
    };

  return NextResponse.json({ ...scenario, lore_items: loreItems ?? [] });
}
