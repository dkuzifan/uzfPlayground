import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { NpcDraft } from "@/app/api/trpg/scenarios/generate-npcs/route";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { scenario_id, npcs } = body as {
      scenario_id?: string;
      npcs?: NpcDraft[];
    };

    if (!scenario_id || !Array.isArray(npcs) || npcs.length === 0) {
      return NextResponse.json({ error: "scenario_id와 npcs는 필수입니다." }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("NPC_Persona")
      .insert(
        npcs.map((npc) => ({
          scenario_id,
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
        }))
      )
      .select("id, name, role");

    if (error) {
      console.error("[npc/bulk-create] INSERT 실패:", error);
      return NextResponse.json({ error: "NPC 저장에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ npcs: data }, { status: 201 });
  } catch (err) {
    console.error("[npc/bulk-create] 오류:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
