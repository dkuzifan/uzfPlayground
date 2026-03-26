import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { QuestTracker } from "@/lib/trpg/types/game";

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { session_id, player_id, delta } = body as {
      session_id?: string;
      player_id?: string;
      delta?: number;  // +1 / -1 / 절댓값 설정 시 set_value 사용
      set_value?: number;
    };

    const set_value = (body as { set_value?: number }).set_value;

    if (!session_id || !player_id || (delta === undefined && set_value === undefined)) {
      return NextResponse.json({ error: "필수 파라미터가 누락됐습니다." }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: session } = await supabase
      .from("Game_Session")
      .select("host_player_id, quest_tracker")
      .eq("id", session_id)
      .single() as unknown as {
        data: { host_player_id: string | null; quest_tracker: QuestTracker | null } | null;
      };

    if (!session || session.host_player_id !== player_id) {
      return NextResponse.json({ error: "호스트만 사용할 수 있습니다." }, { status: 403 });
    }

    const qt = session.quest_tracker;
    if (!qt) {
      return NextResponse.json({ error: "퀘스트 트래커가 없습니다." }, { status: 404 });
    }

    const max = qt.doom_clock_max ?? 10;
    let newValue: number;

    if (set_value !== undefined) {
      newValue = Math.min(max, Math.max(0, Math.round(set_value)));
    } else {
      newValue = Math.min(max, Math.max(0, qt.doom_clock + (delta ?? 0)));
    }

    const updated: QuestTracker = { ...qt, doom_clock: newValue };

    const { error } = await supabase
      .from("Game_Session")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ quest_tracker: updated as any, updated_at: new Date().toISOString() })
      .eq("id", session_id);

    if (error) {
      console.error("[gm/doom-clock]", error);
      return NextResponse.json({ error: "Doom Clock 업데이트에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, doom_clock: newValue, doom_clock_max: max });
  } catch (err) {
    console.error("[gm/doom-clock]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
