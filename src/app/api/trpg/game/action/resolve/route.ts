import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runGmAction } from "@/lib/gemini/gm-agent";
import { runNpcDialogue } from "@/lib/gemini/npc-agent";
import { getNextTurn } from "@/lib/game/turn-manager";
import { computeDCFromCategory, defaultResistanceStats } from "@/lib/game/dc-calculator";
import { applyTasteModifiers, buildBaseDeltas } from "@/lib/game/taste-modifier-engine";
import { runMemorySummarize } from "@/lib/game/memory-pipeline";
import { scanAndExtractLore } from "@/lib/game/lore-engine";
import { applyObjectiveUpdate, tickDoomClock, evaluateEndings, applyEnding, deriveScenePhase, advancePhase } from "@/lib/game/objective-engine";
import { evaluateTriggers, markTriggerFired } from "@/lib/game/npc-trigger-engine";
import { runNpcAutonomousAction, evaluateBystanderReactions } from "@/lib/gemini/npc-agent";
import type { WorldDictionaryEntry } from "@/lib/game/lore-engine";
import type { ActionOutcome, DiceRoll, HpChange, RawPlayer, GameSession, ActionLog, NpcPersona, NpcMemory, ActionChoice, ScenarioObjectives, ScenarioEndings, ScenePhase } from "@/lib/types/game";
import type { NpcDynamicState } from "@/lib/types/character";
import type { ActionCategory } from "@/lib/game/dc-calculator";
import type { NpcEmotionDelta } from "@/lib/gemini/gm-agent";
import { JOB_MODIFIERS, defaultDynamicState, clamp, determineReactingNpcs } from "@/lib/game/action-utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const {
      session_id, player_id, local_id,
      action_content, action_type, dc, rolled,
      action_category,
    } = body as {
      session_id?: string;
      player_id?: string;
      local_id?: string;
      action_content?: string;
      action_type?: string;
      dc?: number;
      rolled?: number;
      action_category?: ActionCategory;
    };

    if (!session_id || !player_id || !local_id || !action_content || !action_type
        || dc === undefined || rolled === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // ── 세션 + 플레이어 검증 ──────────────────────────────────────────────────
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

    // ── NPC + 최근 로그 조회 ──────────────────────────────────────────────────
    const [{ data: recentLogsData }, { data: npcsData }, { data: memoriesData }, { data: loreData }, { data: globalMemoryData }] =
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
        supabase
          .from("Session_Memory")
          .select("summary_text, key_facts, last_summarized_turn")
          .eq("session_id", session_id)
          .is("npc_id", null)
          .order("last_summarized_turn", { ascending: false })
          .limit(1)
          .single(),
      ]);

    const recentLogs = ((recentLogsData ?? []).reverse()) as unknown as ActionLog[];
    const npcs = (npcsData ?? []) as unknown as NpcPersona[];
    const introducedNpcs = npcs.filter((n) => n.is_introduced);
    const unintroducedNpcs = npcs.filter((n) => !n.is_introduced);
    const dynamicStates = (session.npc_dynamic_states ?? {}) as Record<string, NpcDynamicState>;
    const targetedNpcs = await determineReactingNpcs(action_content, introducedNpcs, dynamicStates);

    // 전역 세션 요약 포맷
    const globalMemory = globalMemoryData as { summary_text: string; key_facts: string[]; last_summarized_turn: number } | null;
    const sessionSummary = globalMemory
      ? `${globalMemory.summary_text}${globalMemory.key_facts?.length > 0 ? `\n주요 사실: ${globalMemory.key_facts.join(" / ")}` : ""} (${globalMemory.last_summarized_turn}턴까지 요약)`
      : undefined;
    const primaryNpc = targetedNpcs[0] ?? null; // DC 서버 재검증 기준 NPC
    const npcMemories = (memoriesData ?? []) as unknown as NpcMemory[];
    const loreEntries = (loreData ?? []) as unknown as WorldDictionaryEntry[];

    // ── DC 서버측 재검증 (클라이언트 조작 방지) ───────────────────────────────
    // 클라이언트가 보낸 dc를 신뢰하지 않고, action_category로 서버에서 재계산
    let verifiedDc = Number(dc);
    if (action_category && action_category !== "none") {
      const resistance = primaryNpc?.resistance_stats ?? defaultResistanceStats();
      const serverDc = computeDCFromCategory(action_category, resistance);
      if (serverDc !== null) verifiedDc = serverDc;
    }

    // ── 주사위 결과 처리 ──────────────────────────────────────────────────────
    const d20 = Math.min(20, Math.max(1, Math.round(rolled)));
    const modifier = JOB_MODIFIERS[player.job] ?? 0;
    const total = d20 + modifier;

    let outcome: ActionOutcome;
    if (d20 === 20)                outcome = "critical_success";
    else if (total >= verifiedDc + 5) outcome = "success";
    else if (total >= verifiedDc)     outcome = "partial";
    else                              outcome = "failure";

    const diceRoll: DiceRoll = { rolled: d20, modifier, total, label: "판정" };

    // ── 플레이어 Action_Log INSERT ────────────────────────────────────────────
    await supabase.from("Action_Log").insert({
      session_id,
      turn_number: session.turn_number,
      speaker_type: "player",
      speaker_id: player_id,
      speaker_name: player.player_name,
      action_type: action_type as "choice" | "free_input",
      content: action_content,
      outcome,
      state_changes: { dice_roll: diceRoll },
    });

    // ── 취향 모디파이어 + NPC 감정 상태 업데이트 ─────────────────────────────
    let updatedDynamicStates = (session.npc_dynamic_states ?? {}) as Record<string, NpcDynamicState>;
    const npcEmotionDeltas: NpcEmotionDelta[] = [];

    if (targetedNpcs.length > 0) {
      // action_category → buildBaseDeltas actionType 변환 (NPC 공통)
      const mappedActionType = (action_category === "gift" ? "gift"
        : action_category === "deceive" ? "deceive"
        : action_category === "persuade" ? "persuade"
        : action_category === "threaten" ? "threaten"
        : action_category === "attack" ? "attack"
        : "neutral") as Parameters<typeof buildBaseDeltas>[0];

      for (const npc of targetedNpcs) {
        const baseDeltas = buildBaseDeltas(mappedActionType, outcome);
        const { modifiedDeltas } = applyTasteModifiers(
          action_content,
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
        npcEmotionDeltas.push({
          npc_name: npc.name,
          affinity_delta: modifiedDeltas.affinity_delta,
          stress_delta: modifiedDeltas.stress_delta,
          fear_delta: modifiedDeltas.fear_delta,
          trust_delta: modifiedDeltas.trust_delta,
        });
      }
      await supabase
        .from("Game_Session")
        .update({ npc_dynamic_states: updatedDynamicStates })
        .eq("id", session_id);
    }

    // ── Gemini GM 서사 생성 ───────────────────────────────────────────────────
    const { data: scenarioRaw } = await supabase
      .from("Scenario")
      .select("gm_system_prompt, fixed_truths, objectives, endings")
      .eq("id", session.scenario_id)
      .single() as unknown as {
        data: {
          gm_system_prompt: string;
          fixed_truths: Record<string, unknown>;
          objectives: ScenarioObjectives | null;
          endings: ScenarioEndings | null;
        } | null;
      };
    const scenario = scenarioRaw;

    // 씬 페이즈 계산
    const currentScenePhase = (session.scene_phase ?? "exploration") as ScenePhase;
    const derivedPhase = (session.quest_tracker && scenario?.objectives)
      ? deriveScenePhase(session.quest_tracker, scenario.objectives)
      : currentScenePhase;
    const activeScenePhase: ScenePhase = advancePhase(currentScenePhase, derivedPhase);

    let gmNarration = "GM이 잠시 자리를 비웠습니다. 다음 플레이어로 턴을 넘깁니다.";
    let gmStateChanges: Array<{ target_id: string; hp_delta: number }> = [];
    let gmNextChoices: ActionChoice[] = [];
    let gmQuestUpdate: import("@/lib/game/objective-engine").GmObjectiveUpdate | undefined;
    let gmItemObtained: string | null = null;
    let gmStatGrowth: { stat: string; delta: number; reason?: string } | null = null;
    let gmPhaseTransition: ScenePhase | null = null;
    let gmFailurePenalty: import("@/lib/gemini/gm-agent").FailurePenalty | null = null;
    let gmFailureTwist: string | null = null;
    let geminiSucceeded = false;

    try {
      const gmResponse = await runGmAction({
        scenarioSystemPrompt:
          scenario?.gm_system_prompt ?? "당신은 TRPG의 게임 마스터입니다.",
        fixedTruths: (scenario?.fixed_truths as Record<string, unknown>) ?? {},
        recentLogs,
        actingPlayer: player,
        action: action_content,
        actionType: action_type as "choice" | "free_input",
        diceRoll,
        outcome,
        npcEmotionDeltas: npcEmotionDeltas.length > 0 ? npcEmotionDeltas : undefined,
        sessionSummary,
        questTracker: session.quest_tracker,
        objectives: scenario?.objectives,
        scenePhase: activeScenePhase,
        storyBlueprint: session.story_blueprint,
        introducedNpcs: introducedNpcs.map((n) => ({ name: n.name, role: n.role })),
        unintroducedNpcs: unintroducedNpcs.map((n) => ({ name: n.name, role: n.role })),
      });
      gmNarration = gmResponse.narration;
      gmStateChanges = gmResponse.state_changes ?? [];
      gmQuestUpdate = gmResponse.quest_update;
      // GM이 새로 소개한 NPC를 is_introduced=true로 업데이트
      if (gmResponse.npc_introduced?.length) {
        const toIntroduce = npcs.filter((n) => gmResponse.npc_introduced!.includes(n.name) && !n.is_introduced);
        if (toIntroduce.length > 0) {
          await supabase
            .from("NPC_Persona")
            .update({ is_introduced: true })
            .in("id", toIntroduce.map((n) => n.id));
        }
      }
      gmItemObtained = gmResponse.item_obtained ?? null;
      gmStatGrowth = gmResponse.stat_growth ?? null;
      gmFailurePenalty = gmResponse.failure_penalty ?? null;
      gmFailureTwist = gmResponse.failure_twist ?? null;
      if (gmResponse.scene_phase_transition) {
        gmPhaseTransition = advancePhase(activeScenePhase, gmResponse.scene_phase_transition);
      }
      // DC 오버라이드: Gemini가 반환한 dc=0을 NPC resistance_stats 기반 실제 DC로 교체
      const resistance = primaryNpc?.resistance_stats ?? defaultResistanceStats();
      gmNextChoices = (gmResponse.next_choices ?? []).map((choice) => {
        if (!choice.dice_check) return choice;
        const category = choice.dice_check.action_category as ActionCategory | undefined;
        const realDc = category
          ? (computeDCFromCategory(category, resistance) ?? defaultResistanceStats().mental_willpower)
          : defaultResistanceStats().mental_willpower;
        return { ...choice, dice_check: { ...choice.dice_check, dc: realDc } };
      });
      geminiSucceeded = true;
    } catch (err) {
      console.error("[ResolveRoute] runGmAction failed:", err);
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
          active_turn_state: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session_id);
      return NextResponse.json({ rolled: d20, modifier, total, dc: verifiedDc, outcome, gm_error: true });
    }

    // ── HP 변환 + GM Action_Log INSERT ────────────────────────────────────────
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
      outcome,
      state_changes: {
        hp_changes: hpChanges,
        ...(gmFailureTwist ? { failure_twist: gmFailureTwist } : {}),
      },
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

    // ── 실패 페널티 적용 ─────────────────────────────────────────────────────
    if (gmFailurePenalty && geminiSucceeded) {
      if (gmFailurePenalty.npc_hostility && gmFailurePenalty.npc_hostility.length > 0) {
        for (const { npc_name, delta } of gmFailurePenalty.npc_hostility) {
          const npc = npcs.find((n) => n.name === npc_name);
          if (!npc) continue;
          const cur = updatedDynamicStates[npc.id] ?? defaultDynamicState();
          updatedDynamicStates = {
            ...updatedDynamicStates,
            [npc.id]: { ...cur, affinity: clamp(cur.affinity + delta, -100, 100) },
          };
        }
        await supabase
          .from("Game_Session")
          .update({ npc_dynamic_states: updatedDynamicStates })
          .eq("id", session_id);
      }
    }

    // ── 아이템 획득 처리 ─────────────────────────────────────────────────────
    if (gmItemObtained && geminiSucceeded) {
      const currentInventory = (player.inventory ?? []) as string[];
      const newInventory = [...currentInventory, gmItemObtained];
      await supabase
        .from("Player_Character")
        .update({ inventory: newInventory })
        .eq("id", player_id);
      await supabase.from("Action_Log").insert({
        session_id,
        turn_number: session.turn_number,
        speaker_type: "system",
        speaker_id: null,
        speaker_name: "시스템",
        action_type: "system_event",
        content: `🎒 [${player.player_name}] 아이템 획득: ${gmItemObtained}`,
        outcome: null,
        state_changes: { item_obtained: gmItemObtained },
      });
    }

    // ── 스탯 성장 처리 ───────────────────────────────────────────────────────
    if (gmStatGrowth && geminiSucceeded) {
      const { stat, delta, reason } = gmStatGrowth;
      const currentStats = player.stats as Record<string, number>;
      if (typeof currentStats[stat] === "number") {
        const newVal = currentStats[stat] + delta;
        const updatedStats: Record<string, number> = { ...currentStats, [stat]: newVal };
        // hp 성장 시 max_hp도 같이 증가
        if (stat === "hp") updatedStats.max_hp = (currentStats.max_hp ?? currentStats.hp) + delta;
        await supabase
          .from("Player_Character")
          .update({ stats: updatedStats })
          .eq("id", player_id);
        await supabase.from("Action_Log").insert({
          session_id,
          turn_number: session.turn_number,
          speaker_type: "system",
          speaker_id: null,
          speaker_name: "시스템",
          action_type: "system_event",
          content: `📈 [${player.player_name}] ${stat} +${delta}${reason ? ` — ${reason}` : ""}`,
          outcome: null,
          state_changes: { stat_growth: { stat, delta, reason } },
        });
      }
    }

    // ── NPC 대화 생성 (대상 NPC 전체) ────────────────────────────────────────
    if (targetedNpcs.length > 0 && geminiSucceeded) {
      // Lore 추출은 주 대상 NPC(첫 번째) 기준으로 1회 실행
      const loreSourceNpc = targetedNpcs[0];
      const loreSourceState = updatedDynamicStates[loreSourceNpc.id] ?? null;
      const currentPendingQueue = (session.pending_lore_queue ?? []) as string[];
      const { loreContext, updatedPendingQueue } = scanAndExtractLore({
        playerText: action_content,
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

      const outcomeLabel: Record<string, string> = {
        critical_success: "크리티컬 성공",
        success: "성공",
        partial: "부분 성공",
        failure: "실패",
      };
      const npcContext = `[GM 서술 / 판정 결과: ${outcomeLabel[outcome ?? ""] ?? outcome}] ${gmNarration}\n[플레이어 행동] ${action_content}`;

      for (const npc of targetedNpcs) {
        try {
          const npcState = updatedDynamicStates[npc.id] ?? null;
          const npcSpecificMemories = npcMemories.filter(
            (m): m is NpcMemory => (m as NpcMemory).npc_id === npc.id
          );
          const npcResponse = await runNpcDialogue(npc, conversationHistory, npcContext, {
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
            content: npcResponse.dialogue,
            outcome: null,
            state_changes: { stage_direction: npcResponse.stage_direction },
          });
        } catch (err) {
          console.error(`[ResolveRoute] runNpcDialogue failed for npc=${npc.id}:`, err);
        }
      }

      // Lore 발견 로그 (NPC가 실제로 정보를 공개한 경우)
      if (loreContext.currentLoreTexts.length > 0) {
        await supabase.from("Action_Log").insert({
          session_id,
          turn_number: session.turn_number,
          speaker_type: "system",
          speaker_id: null,
          speaker_name: "세계관 단서",
          action_type: "lore_discovery",
          content: loreContext.currentLoreTexts.join("\n\n"),
          outcome: null,
          state_changes: {},
        });
      }
    }

    // ── NPC 방관자 반응 (소개된 NPC 중 최대 2명) ─────────────────────────────
    const targetedNpcIds = new Set(targetedNpcs.map((n) => n.id));
    const bystanders = introducedNpcs.filter((n) => !targetedNpcIds.has(n.id));
    if (bystanders.length > 0 && geminiSucceeded) {
      try {
        const allReactingIds = await evaluateBystanderReactions(
          action_content,
          bystanders.map((npc) => ({
            npc,
            dynamicState: updatedDynamicStates[npc.id] ?? null,
          }))
        );
        const reactingIds = allReactingIds.slice(0, 2);
        for (const npcId of reactingIds) {
          const npc = bystanders.find((n) => n.id === npcId);
          if (!npc) continue;
          try {
            const npcState = updatedDynamicStates[npc.id];
            const contextHint = `${npc.name}이(가) 근처에서 이 장면을 목격했다. 자신의 성격에 맞게 짧게(1~2문장) 반응하라. 직접 개입하거나 무시해도 된다.`;
            const reaction = await runNpcAutonomousAction(
              npc,
              "bystander_reaction",
              contextHint,
              recentLogs,
              npcState
            );
            await supabase.from("Action_Log").insert({
              session_id,
              turn_number: session.turn_number,
              speaker_type: "npc",
              speaker_id: npc.id,
              speaker_name: npc.name,
              action_type: "npc_dialogue",
              content: reaction.dialogue,
              outcome: null,
              state_changes: { bystander: true, stage_direction: reaction.stage_direction },
            });
          } catch (err) {
            console.error(`[ResolveRoute] bystander reaction failed (npc=${npcId}):`, err);
          }
        }
      } catch (err) {
        console.error("[ResolveRoute] evaluateBystanderReactions failed:", err);
      }
    }

    // ── 목표 진척도 업데이트 + 엔딩 평가 ─────────────────────────────────────
    let updatedQuestTracker = session.quest_tracker;
    let sessionEnded = false;

    if (updatedQuestTracker && scenario?.objectives) {
      updatedQuestTracker = tickDoomClock(updatedQuestTracker);

      // 실패 페널티 — Doom Clock 추가 가속
      if (gmFailurePenalty?.doom_delta) {
        updatedQuestTracker = {
          ...updatedQuestTracker,
          doom_clock: Math.min(
            updatedQuestTracker.doom_clock + gmFailurePenalty.doom_delta,
            updatedQuestTracker.doom_clock_max
          ),
        };
      }

      if (gmQuestUpdate) {
        updatedQuestTracker = applyObjectiveUpdate(updatedQuestTracker, gmQuestUpdate, scenario.objectives);
      }

      if (scenario?.endings && !updatedQuestTracker.ended) {
        const achievedEnding = evaluateEndings(updatedQuestTracker, scenario.objectives, scenario.endings);
        if (achievedEnding) {
          updatedQuestTracker = applyEnding(updatedQuestTracker, achievedEnding);
          sessionEnded = true;
        }
      }
    }

    // ── 턴 전진 ───────────────────────────────────────────────────────────────
    const nextTurnNumber = session.turn_number + 1;
    const nextTurn = getNextTurn(session);
    const finalScenePhase: ScenePhase = gmPhaseTransition ?? activeScenePhase;
    await supabase
      .from("Game_Session")
      .update({
        current_turn_player_id: sessionEnded ? null : (nextTurn?.id ?? null),
        turn_number: nextTurnNumber,
        status: sessionEnded ? "completed" : session.status,
        quest_tracker: updatedQuestTracker,
        scene_phase: sessionEnded ? "resolution" : finalScenePhase,
        active_turn_state: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    // ── NPC 이벤트 트리거 평가 ────────────────────────────────────────────────
    if (!sessionEnded) {
      const triggerEvents = evaluateTriggers(npcs, updatedDynamicStates);
      if (triggerEvents.length > 0) {
        let triggeredStates = { ...updatedDynamicStates };
        for (const event of triggerEvents) {
          try {
            const npcState = triggeredStates[event.npc.id];
            const dialogue = await runNpcAutonomousAction(
              event.npc,
              event.trigger,
              event.contextHint,
              recentLogs,
              npcState
            );
            await supabase.from("Action_Log").insert({
              session_id,
              turn_number: nextTurnNumber,
              speaker_type: "npc",
              speaker_id: event.npc.id,
              speaker_name: event.npc.name,
              action_type: "npc_dialogue",
              content: dialogue.dialogue,
              outcome: null,
              state_changes: { trigger: event.trigger, stage_direction: dialogue.stage_direction },
            });
            if (npcState) {
              triggeredStates = {
                ...triggeredStates,
                [event.npc.id]: markTriggerFired(npcState, event.trigger),
              };
            }
          } catch (err) {
            console.error(`[ResolveRoute] NPC trigger failed (npc=${event.npc.id}):`, err);
          }
        }
        await supabase
          .from("Game_Session")
          .update({ npc_dynamic_states: triggeredStates })
          .eq("id", session_id);
      }
    }

    // 5턴마다 메모리 요약 (fire-and-forget)
    if (nextTurnNumber % 5 === 0) {
      runMemorySummarize(session_id).catch((err) =>
        console.error(`[MemoryPipeline] session=${session_id}`, err)
      );
    }

    return NextResponse.json({ rolled: d20, modifier, total, dc: verifiedDc, outcome, next_choices: gmNextChoices, session_ended: sessionEnded });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
