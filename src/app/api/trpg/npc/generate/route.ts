import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { generateNpcsForScenario } from "@/lib/trpg/gemini/npc-agent";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scenario_id, session_id } = body as {
      scenario_id?: string;
      session_id?: string;
    };

    if (!scenario_id || !session_id) {
      return NextResponse.json(
        { error: "scenario_id와 session_id는 필수입니다." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // 시나리오 컨텍스트 조회
    const { data: scenario, error: scenarioError } = await supabase
      .from("Scenario")
      .select("gm_system_prompt, theme, description")
      .eq("id", scenario_id)
      .single();

    if (scenarioError || !scenario) {
      return NextResponse.json({ error: "시나리오를 찾을 수 없습니다." }, { status: 404 });
    }

    // NPC 생성
    const generatedNpcs = await generateNpcsForScenario({
      gm_system_prompt: scenario.gm_system_prompt,
      theme: scenario.theme,
      description: scenario.description,
    });

    if (generatedNpcs.length === 0) {
      return NextResponse.json({ error: "NPC 생성에 실패했습니다." }, { status: 500 });
    }

    // DB INSERT
    const { data: inserted, error: insertError } = await supabase
      .from("NPC_Persona")
      .insert(
        generatedNpcs.map((npc) => ({
          scenario_id,
          session_id,
          name: npc.name,
          role: npc.role,
          appearance: npc.appearance,
          personality: npc.personality,
          mbti: npc.mbti,
          enneagram: npc.enneagram,
          dnd_alignment: npc.dnd_alignment,
          hidden_motivation: npc.hidden_motivation,
          system_prompt: npc.system_prompt,
          stats: { hp: 30, max_hp: 30, attack: 5, defense: 5 },
          linguistic_profile: npc.linguistic_profile,
          knowledge_level: npc.knowledge_level,
        }))
      )
      .select("id, name, role, appearance, personality");

    if (insertError) {
      console.error("[npc/generate] INSERT 실패:", insertError);
      return NextResponse.json({ error: "NPC 저장에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ npcs: inserted }, { status: 201 });
  } catch (err) {
    console.error("[npc/generate] 오류:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
