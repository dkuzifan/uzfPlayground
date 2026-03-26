import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// 조정 가능한 필드와 범위
const NPC_STATE_FIELDS: Record<string, { min: number; max: number }> = {
  affinity:              { min: -100, max: 100 },
  trust:                 { min: -100, max: 100 },
  fear_survival:         { min: 0,    max: 100 },
  mental_stress:         { min: 0,    max: 100 },
  physical_fatigue:      { min: 0,    max: 100 },
  self_image_management: { min: 0,    max: 100 },
  personal_debt:         { min: 0,    max: 100 },
  sense_of_duty:         { min: 0,    max: 100 },
  camaraderie:           { min: 0,    max: 100 },
};

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { session_id, player_id, npc_id, field, value } = body as {
      session_id?: string;
      player_id?: string;
      npc_id?: string;
      field?: string;
      value?: number;
    };

    if (!session_id || !player_id || !npc_id || !field || value === undefined) {
      return NextResponse.json({ error: "필수 파라미터가 누락됐습니다." }, { status: 400 });
    }

    const range = NPC_STATE_FIELDS[field];
    if (!range) {
      return NextResponse.json({ error: `허용되지 않는 필드: ${field}` }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: session } = await supabase
      .from("Game_Session")
      .select("host_player_id, npc_dynamic_states")
      .eq("id", session_id)
      .single() as unknown as {
        data: { host_player_id: string | null; npc_dynamic_states: Record<string, Record<string, unknown>> | null } | null;
      };

    if (!session || session.host_player_id !== player_id) {
      return NextResponse.json({ error: "호스트만 사용할 수 있습니다." }, { status: 403 });
    }

    const clampedValue = Math.min(range.max, Math.max(range.min, Math.round(value)));
    const states = session.npc_dynamic_states ?? {};
    const npcState = states[npc_id] ?? {};
    const updated = { ...states, [npc_id]: { ...npcState, [field]: clampedValue } };

    const { error } = await supabase
      .from("Game_Session")
      .update({ npc_dynamic_states: updated, updated_at: new Date().toISOString() })
      .eq("id", session_id);

    if (error) {
      console.error("[gm/npc-state]", error);
      return NextResponse.json({ error: "NPC 상태 업데이트에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, npc_id, field, value: clampedValue });
  } catch (err) {
    console.error("[gm/npc-state]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
