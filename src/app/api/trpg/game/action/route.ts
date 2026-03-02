import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runGmAction, checkDiceNeed } from "@/lib/gemini/gm-agent";
import { getNextTurn } from "@/lib/game/turn-manager";
import type { HpChange, RawPlayer, GameSession, ActionLog } from "@/lib/types/game";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { session_id, player_id, local_id, action_type, content } = body as {
      session_id?: string;
      player_id?: string;
      local_id?: string;
      action_type?: string;
      content?: string;
    };

    if (!session_id || !player_id || !local_id || !action_type || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // ── Step 1: 검증 ──────────────────────────────────────────────────
    const { data: sessionData, error: sessionError } = (await supabase
      .from("Game_Session")
      .select("*")
      .eq("id", session_id)
      .single()) as unknown as {
      data: GameSession | null;
      error: { message: string } | null;
    };

    if (sessionError || !sessionData) {
      return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
    }
    if (sessionData.status !== "in_progress") {
      return NextResponse.json({ error: "진행 중인 세션이 아닙니다." }, { status: 403 });
    }
    if (sessionData.current_turn_player_id !== player_id) {
      return NextResponse.json({ error: "현재 당신의 턴이 아닙니다." }, { status: 403 });
    }

    const { data: playerData, error: playerError } = (await supabase
      .from("Player_Character")
      .select("*")
      .eq("id", player_id)
      .eq("session_id", session_id)
      .eq("user_id", local_id)
      .single()) as unknown as {
      data: RawPlayer | null;
      error: { message: string } | null;
    };

    if (playerError || !playerData) {
      return NextResponse.json({ error: "플레이어를 찾을 수 없습니다." }, { status: 403 });
    }

    const session = sessionData;
    const player = playerData;

    // ── Step 2: 주사위 판정 필요 여부 확인 (free_input 전용) ───────
    // choice 타입은 선택지 생성 시점에 이미 주사위 여부가 결정됨 → 재판단 불필요
    const { data: recentLogsData } = await supabase
      .from("Action_Log")
      .select("*")
      .eq("session_id", session_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const recentLogs = ((recentLogsData ?? []).reverse()) as unknown as ActionLog[];

    if (action_type === "free_input") {
      const diceNeed = await checkDiceNeed(content, recentLogs);
      if (diceNeed.needs_check) {
        return NextResponse.json({
          needs_dice_check: true,
          dc: diceNeed.dc ?? 13,
          check_label: diceNeed.label ?? "판정",
        });
      }
    }

    // ── needs_check: false → 주사위 없는 플로우 (GM 서사 + 턴 전진) ──

    // 플레이어 Action_Log INSERT (주사위 없음)
    await supabase.from("Action_Log").insert({
      session_id,
      turn_number: session.turn_number,
      speaker_type: "player",
      speaker_id: player_id,
      speaker_name: player.player_name,
      action_type: action_type as "choice" | "free_input",
      content,
      outcome: null,
      state_changes: {},
    });

    // Gemini GM 호출
    const { data: scenario } = await supabase
      .from("Scenario")
      .select("gm_system_prompt, fixed_truths")
      .eq("id", session.scenario_id)
      .single();

    let gmNarration = "GM이 잠시 자리를 비웠습니다. 다음 플레이어로 턴을 넘깁니다.";
    let gmStateChanges: Array<{ target_id: string; hp_delta: number }> = [];
    let geminiSucceeded = false;

    try {
      const gmResponse = await runGmAction({
        scenarioSystemPrompt:
          scenario?.gm_system_prompt ?? "당신은 TRPG의 게임 마스터입니다.",
        fixedTruths: (scenario?.fixed_truths as Record<string, unknown>) ?? {},
        recentLogs,
        actingPlayer: player,
        action: content,
        actionType: action_type as "choice" | "free_input",
      });
      gmNarration = gmResponse.narration;
      gmStateChanges = gmResponse.state_changes ?? [];
      geminiSucceeded = true;
    } catch {
      await supabase.from("Action_Log").insert({
        session_id,
        turn_number: session.turn_number,
        speaker_type: "system",
        speaker_id: null,
        speaker_name: "시스템",
        action_type: "system_event",
        content: "GM이 잠시 자리를 비웠습니다.",
        outcome: null,
        state_changes: {},
      });
      const nextTurn = getNextTurn(session);
      await supabase
        .from("Game_Session")
        .update({
          current_turn_player_id: nextTurn?.id ?? null,
          turn_number: session.turn_number + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session_id);
      return NextResponse.json({ ok: true });
    }

    // HP 변환 + GM Action_Log INSERT
    const hpChanges: HpChange[] = [];

    if (geminiSucceeded) {
      for (const change of gmStateChanges) {
        if (!change.target_id || typeof change.hp_delta !== "number") continue;

        const { data: target } = await supabase
          .from("Player_Character")
          .select("id, character_name, stats")
          .eq("id", change.target_id)
          .single();

        if (!target) continue;

        const targetStats = target.stats as { hp: number; max_hp: number };
        const old_hp = targetStats.hp;
        const new_hp = Math.max(0, Math.min(targetStats.max_hp, old_hp + change.hp_delta));

        hpChanges.push({
          target_id: change.target_id,
          name: target.character_name,
          old_hp,
          new_hp,
          delta: change.hp_delta,
        });
      }
    }

    await supabase.from("Action_Log").insert({
      session_id,
      turn_number: session.turn_number,
      speaker_type: "gm",
      speaker_id: null,
      speaker_name: "GM",
      action_type: "gm_narration",
      content: gmNarration,
      outcome: null,
      state_changes: { hp_changes: hpChanges },
    });

    // HP 업데이트
    for (const hpChange of hpChanges) {
      const { data: target } = await supabase
        .from("Player_Character")
        .select("stats")
        .eq("id", hpChange.target_id)
        .single();

      if (!target) continue;

      const currentStats = target.stats as Record<string, unknown>;
      await supabase
        .from("Player_Character")
        .update({
          stats: { ...currentStats, hp: hpChange.new_hp },
          updated_at: new Date().toISOString(),
        })
        .eq("id", hpChange.target_id);
    }

    // 턴 전진
    const nextTurn = getNextTurn(session);
    await supabase
      .from("Game_Session")
      .update({
        current_turn_player_id: nextTurn?.id ?? null,
        turn_number: session.turn_number + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
