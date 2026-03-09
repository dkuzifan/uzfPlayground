import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runGmAction, checkDiceNeed } from "@/lib/gemini/gm-agent";
import { runNpcDialogue } from "@/lib/gemini/npc-agent";
import { getNextTurn } from "@/lib/game/turn-manager";
import { computeDCFromCategory, defaultResistanceStats } from "@/lib/game/dc-calculator";
import { applyTasteModifiers, buildBaseDeltas } from "@/lib/game/taste-modifier-engine";
import { runMemorySummarize } from "@/lib/game/memory-pipeline";
import { scanAndExtractLore } from "@/lib/game/lore-engine";
import type { WorldDictionaryEntry } from "@/lib/game/lore-engine";
import type { HpChange, RawPlayer, GameSession, ActionLog, NpcPersona, NpcMemory } from "@/lib/types/game";
import type { NpcDynamicState } from "@/lib/types/character";
import { defaultDynamicState, clamp, determineTargetedNpcs } from "@/lib/game/action-utils";

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

    // ── Step 1: 세션 + 플레이어 검증 ──────────────────────────────────────────
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

    // ── Step 2: NPC 조회 + 최근 로그 조회 ─────────────────────────────────────
    const [{ data: recentLogsData }, { data: npcsData }, { data: memoriesData }, { data: loreData }] =
      await Promise.all([
        supabase
          .from("Action_Log")
          .select("*")
          .eq("session_id", session_id)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("NPC_Persona")
          .select("*")
          .eq("session_id", session_id),
        supabase
          .from("Session_Memory")
          .select("*")
          .eq("session_id", session_id)
          .not("npc_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("World_Dictionary")
          .select("*")
          .eq("scenario_id", session.scenario_id),
      ]);

    const recentLogs = ((recentLogsData ?? []).reverse()) as unknown as ActionLog[];
    const npcs = (npcsData ?? []) as unknown as NpcPersona[];
    const targetedNpcs = determineTargetedNpcs(content, npcs);
    const primaryNpc = targetedNpcs[0] ?? null; // DC 계산, Lore 기준 NPC
    const npcMemories = (memoriesData ?? []) as unknown as NpcMemory[];
    const loreEntries = (loreData ?? []) as unknown as WorldDictionaryEntry[];

    // ── Step 3: 주사위 판정 필요 여부 확인 (free_input 전용) ──────────────────
    if (action_type === "free_input") {
      const diceNeed = await checkDiceNeed(content, recentLogs);
      if (diceNeed.needs_check && diceNeed.action_category) {
        // DC 계산: NPC resistance_stats 기반 deterministic (AI hallucination 없음)
        const resistance = primaryNpc?.resistance_stats ?? defaultResistanceStats();
        const dc = computeDCFromCategory(diceNeed.action_category, resistance) ?? 13;

        return NextResponse.json({
          needs_dice_check: true,
          dc,
          check_label: diceNeed.label ?? "판정",
          action_category: diceNeed.action_category, // resolve route에서 사용
        });
      }
    }

    // ── Step 4: 주사위 없는 플로우 ────────────────────────────────────────────

    // 플레이어 Action_Log INSERT
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

    // ── Step 5: 취향 모디파이어 + NPC 감정 상태 업데이트 ─────────────────────
    let updatedDynamicStates = (session.npc_dynamic_states ?? {}) as Record<string, NpcDynamicState>;

    if (targetedNpcs.length > 0) {
      for (const npc of targetedNpcs) {
        const baseDeltas = buildBaseDeltas("neutral", null);
        const { modifiedDeltas } = applyTasteModifiers(
          content,
          npc.taste_preferences ?? [],
          baseDeltas
        );
        const currentState = updatedDynamicStates[npc.id] ?? defaultDynamicState();
        const updatedState: NpcDynamicState = {
          ...currentState,
          affinity: clamp(currentState.affinity + modifiedDeltas.affinity_delta, -100, 100),
          mental_stress: clamp(currentState.mental_stress + modifiedDeltas.stress_delta, 0, 100),
          fear_survival: clamp(currentState.fear_survival + modifiedDeltas.fear_delta, 0, 100),
          trust: clamp(currentState.trust + (modifiedDeltas.trust_delta ?? 0), -100, 100),
        };
        updatedDynamicStates = { ...updatedDynamicStates, [npc.id]: updatedState };
      }
      await supabase
        .from("Game_Session")
        .update({ npc_dynamic_states: updatedDynamicStates })
        .eq("id", session_id);
    }

    // ── Step 6: Gemini GM 서사 생성 ───────────────────────────────────────────
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

    // ── Step 7: HP 변환 + GM Action_Log INSERT ────────────────────────────────
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

    // ── Step 8: NPC 대화 생성 (대상 NPC 전체) ────────────────────────────────
    if (targetedNpcs.length > 0 && geminiSucceeded) {
      // Lore 추출은 주 대상 NPC(첫 번째) 기준으로 1회 실행
      const loreSourceNpc = targetedNpcs[0];
      const loreSourceState = updatedDynamicStates[loreSourceNpc.id] ?? null;
      const currentPendingQueue = (session.pending_lore_queue ?? []) as string[];
      const { loreContext, updatedPendingQueue } = scanAndExtractLore({
        playerText: content,
        npcKnowledgeLevel: loreSourceNpc.knowledge_level ?? 5,
        npcTrust: loreSourceState?.trust ?? 0,
        loreEntries,
        pendingQueue: currentPendingQueue,
      });
      if (updatedPendingQueue.join(",") !== currentPendingQueue.join(",")) {
        await supabase
          .from("Game_Session")
          .update({ pending_lore_queue: updatedPendingQueue })
          .eq("id", session_id);
      }

      const conversationHistory = recentLogs
        .filter((log) => log.speaker_type === "player" || log.speaker_type === "npc")
        .map((log) => ({
          role: (log.speaker_type === "player" ? "user" : "model") as "user" | "model",
          content: log.content,
        }));

      for (const npc of targetedNpcs) {
        try {
          const npcState = updatedDynamicStates[npc.id] ?? null;
          const npcSpecificMemories = npcMemories.filter(
            (m): m is NpcMemory => (m as NpcMemory).npc_id === npc.id
          );
          const npcResponse = await runNpcDialogue(npc, conversationHistory, content, {
            dynamicState: npcState ?? undefined,
            playerName: player.player_name,
            memories: npcSpecificMemories,
            lore: loreContext,
          });
          await supabase.from("Action_Log").insert({
            session_id,
            turn_number: session.turn_number,
            speaker_type: "npc",
            speaker_id: npc.id,
            speaker_name: npc.name,
            action_type: "npc_dialogue",
            content: npcResponse,
            outcome: null,
            state_changes: {},
          });
        } catch {
          // 개별 NPC 대화 실패는 무시 (GM 서사만으로 턴 진행 가능)
        }
      }
    }

    // ── Step 9: 턴 전진 ───────────────────────────────────────────────────────
    const nextTurnNumber = session.turn_number + 1;
    const nextTurn = getNextTurn(session);
    await supabase
      .from("Game_Session")
      .update({
        current_turn_player_id: nextTurn?.id ?? null,
        turn_number: nextTurnNumber,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    // ── Step 10: 5턴마다 메모리 요약 (fire-and-forget) ────────────────────────
    if (nextTurnNumber % 5 === 0) {
      runMemorySummarize(session_id).catch((err) =>
        console.error(`[MemoryPipeline] session=${session_id}`, err)
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
