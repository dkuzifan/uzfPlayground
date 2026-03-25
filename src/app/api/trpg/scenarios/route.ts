import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { ScenarioObjectives, ScenarioEndings, CharacterConfig } from "@/lib/trpg/types/game";
import type { LoreItemInput } from "./generate-lore/route";

const VALID_THEMES = new Set(["fantasy", "mystery", "horror", "sci-fi"]);

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

// ── POST /api/trpg/scenarios — 새 시나리오 저장 ──────────────────────
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    title,
    theme,
    description,
    max_players,
    gm_system_prompt,
    character_creation_config,
    objectives,
    endings,
    character_config,
    game_rules,
    lore_items,
  } = body as {
    title?: string;
    theme?: string;
    description?: string;
    max_players?: number;
    gm_system_prompt?: string;
    character_creation_config?: {
      available_jobs: string[];
      job_labels: Record<string, string>;
      personality_test_theme: string;
      character_name_hint: string;
    };
    objectives?: ScenarioObjectives;
    endings?: ScenarioEndings;
    character_config?: CharacterConfig;
    game_rules?: Record<string, unknown>;
    lore_items?: LoreItemInput[];
  };

  if (!title?.trim()) {
    return NextResponse.json({ error: "제목은 필수입니다." }, { status: 400 });
  }
  if (!theme || !VALID_THEMES.has(theme)) {
    return NextResponse.json({ error: "올바른 테마를 선택해주세요." }, { status: 400 });
  }
  if (!gm_system_prompt?.trim()) {
    return NextResponse.json({ error: "GM 프롬프트는 필수입니다." }, { status: 400 });
  }
  if (
    !character_creation_config?.available_jobs?.length ||
    !character_creation_config?.job_labels
  ) {
    return NextResponse.json({ error: "직업 설정은 필수입니다." }, { status: 400 });
  }

  const safeMaxPlayers = Math.min(7, Math.max(2, max_players ?? 4));

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("Scenario")
    .insert({
      title: title.trim().slice(0, 40),
      theme,
      description: description?.trim().slice(0, 300) ?? null,
      max_players: safeMaxPlayers,
      gm_system_prompt: gm_system_prompt.trim(),
      character_creation_config,
      objectives: objectives ?? null,
      endings: endings ?? null,
      character_config: character_config ?? null,
      game_rules: game_rules ?? null,
      is_active: true,
    })
    .select("id, title, theme, description, max_players, character_creation_config")
    .single();

  if (error || !data) {
    console.error("[POST /api/trpg/scenarios]", error);
    return NextResponse.json({ error: "시나리오 저장에 실패했습니다." }, { status: 500 });
  }

  // Lore 항목 일괄 저장
  if (lore_items && lore_items.length > 0) {
    const loreRows = lore_items.map((item) => ({
      scenario_id: data.id,
      domain: item.domain,
      category: item.category,
      lore_text: item.lore_text.slice(0, 500),
      trigger_keywords: item.trigger_keywords,
      cluster_tags: item.cluster_tags,
      importance_weight: Math.min(10, Math.max(1, item.importance_weight)),
      required_access_level: Math.min(10, Math.max(1, item.required_access_level)),
    }));
    const { error: loreError } = await supabase.from("World_Dictionary").insert(loreRows);
    if (loreError) {
      console.error("[POST /api/trpg/scenarios] Lore 저장 실패:", loreError);
      // Lore 저장 실패는 시나리오 자체를 실패시키지 않음
    }
  }

  return NextResponse.json(data, { status: 201 });
}
