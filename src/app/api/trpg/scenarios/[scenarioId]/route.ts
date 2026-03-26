import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { ScenarioObjectives, ScenarioEndings, CharacterConfig, GameRules } from "@/lib/trpg/types/game";
import type { LoreItemInput } from "../generate-lore/route";
import type { NpcDraft } from "../generate-npcs/route";

interface RouteParams {
  params: Promise<{ scenarioId: string }>;
}

const VALID_THEMES = new Set(["fantasy", "mystery", "horror", "sci-fi"]);

export async function GET(_req: Request, { params }: RouteParams) {
  const { scenarioId } = await params;
  const supabase = createServiceClient();

  const { data: scenario, error } = await supabase
    .from("Scenario")
    .select(
      "id, title, theme, description, max_players, gm_system_prompt, character_creation_config, objectives, endings, character_config, game_rules"
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
        game_rules: GameRules | null;
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

  // NPC 항목 조회 (시나리오 레벨 NPC만)
  const { data: npcItems } = await supabase
    .from("NPC_Persona")
    .select("name, role, appearance, personality, mbti, enneagram, dnd_alignment, hidden_motivation, system_prompt, linguistic_profile, resistance_stats, knowledge_level")
    .eq("scenario_id", scenarioId)
    .is("session_id", null) as unknown as {
      data: NpcDraft[] | null;
    };

  return NextResponse.json({ ...scenario, lore_items: loreItems ?? [], npc_items: npcItems ?? [] });
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { scenarioId } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

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
    npcs,
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
    game_rules?: GameRules;
    lore_items?: LoreItemInput[];
    npcs?: NpcDraft[];
  };

  if (!title?.trim()) return NextResponse.json({ error: "제목은 필수입니다." }, { status: 400 });
  if (!theme || !VALID_THEMES.has(theme)) return NextResponse.json({ error: "올바른 테마를 선택해주세요." }, { status: 400 });
  if (!gm_system_prompt?.trim()) return NextResponse.json({ error: "GM 프롬프트는 필수입니다." }, { status: 400 });

  const safeMaxPlayers = Math.min(7, Math.max(2, max_players ?? 4));
  const supabase = createServiceClient();

  // 시나리오 업데이트
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("Scenario")
    .update({
      title: title.trim().slice(0, 40),
      theme,
      description: description?.trim().slice(0, 300) ?? null,
      max_players: safeMaxPlayers,
      gm_system_prompt: gm_system_prompt.trim(),
      character_creation_config: character_creation_config ?? null,
      objectives: objectives ?? null,
      endings: endings ?? null,
      character_config: character_config ?? null,
      game_rules: game_rules ?? null,
    })
    .eq("id", scenarioId)
    .select("id, title, theme, description, max_players, character_creation_config")
    .single() as {
      data: { id: string; title: string; theme: string; description: string | null; max_players: number; character_creation_config: Record<string, unknown> } | null;
      error: { message: string } | null;
    };

  if (error || !data) {
    console.error("[PUT /api/trpg/scenarios/:id]", error);
    return NextResponse.json({ error: "시나리오 수정에 실패했습니다." }, { status: 500 });
  }

  // Lore 교체: 기존 삭제 후 재삽입
  await supabase.from("World_Dictionary").delete().eq("scenario_id", scenarioId);
  if (lore_items && lore_items.length > 0) {
    const loreRows = lore_items.map((item) => ({
      scenario_id: scenarioId,
      domain: item.domain,
      category: item.category,
      lore_text: item.lore_text.slice(0, 500),
      trigger_keywords: item.trigger_keywords,
      cluster_tags: item.cluster_tags,
      importance_weight: Math.min(10, Math.max(1, item.importance_weight)),
      required_access_level: Math.min(10, Math.max(1, item.required_access_level)),
    }));
    const { error: loreError } = await supabase.from("World_Dictionary").insert(loreRows);
    if (loreError) console.error("[PUT /api/trpg/scenarios/:id] Lore 저장 실패:", loreError);
  }

  // NPC 교체: 시나리오 레벨 NPC만 삭제 후 재삽입
  await supabase.from("NPC_Persona").delete().eq("scenario_id", scenarioId).is("session_id", null);
  if (npcs && npcs.length > 0) {
    const validNpcs = npcs.filter((n) => n.name?.trim() && n.system_prompt?.trim());
    if (validNpcs.length > 0) {
      const npcRows = validNpcs.map((npc) => ({
        scenario_id: scenarioId,
        session_id: null,
        name: npc.name,
        role: npc.role,
        appearance: npc.appearance,
        personality: npc.personality,
        mbti: npc.mbti,
        enneagram: npc.enneagram,
        dnd_alignment: npc.dnd_alignment,
        hidden_motivation: npc.hidden_motivation,
        system_prompt: npc.system_prompt,
        linguistic_profile: npc.linguistic_profile,
        resistance_stats: npc.resistance_stats,
        knowledge_level: npc.knowledge_level,
        custom_triggers: npc.custom_triggers ?? null,
        stats: { hp: 30, max_hp: 30, attack: 5, defense: 5 },
      }));
      const { error: npcError } = await supabase.from("NPC_Persona").insert(npcRows);
      if (npcError) console.error("[PUT /api/trpg/scenarios/:id] NPC 저장 실패:", npcError);
    }
  }

  return NextResponse.json(data);
}
