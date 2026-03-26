"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { ActionLog, ActionChoice, RawPlayer, GameSession, Scenario, NpcPersona } from "@/lib/trpg/types/game";
import { JOB_MODIFIERS } from "@/lib/trpg/game/action-utils";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface ReactionEvent {
  id: string;
  playerId: string;
  playerName: string;
  emoji: string;
}

const FALLBACK_CHOICES: ActionChoice[] = [
  {
    id: "f1",
    label: "신중하게 접근한다",
    description: "상황을 면밀히 살피며 조심스럽게 나아간다.",
    action_type: "choice",
  },
  {
    id: "f2",
    label: "대담하게 행동한다",
    description: "위험을 무릅쓰고 과감하게 돌파한다.",
    action_type: "choice",
  },
  {
    id: "f3",
    label: "상황을 관찰한다",
    description: "잠시 멈추고 주변을 살피며 정보를 모은다.",
    action_type: "choice",
  },
];


export interface PendingDice {
  dc: number;
  modifier: number;
  check_label: string;
  action_content: string;
  action_type: "choice" | "free_input";
  action_category?: string;
}

export function useGameScreen(sessionId: string, localId: string | null) {
  const router = useRouter();
  const [session, setSession]           = useState<GameSession | null>(null);
  const [scenario, setScenario]         = useState<Scenario | null>(null);
  const [players, setPlayers]           = useState<RawPlayer[]>([]);
  const [npcs, setNpcs]                 = useState<NpcPersona[]>([]);
  const [logs, setLogs]                 = useState<ActionLog[]>([]);
  const [myPlayer, setMyPlayer]         = useState<RawPlayer | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [choices, setChoices]           = useState<ActionChoice[]>([]);
  const [choicesLoading, setChoicesLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingDice, setPendingDice]   = useState<PendingDice | null>(null);
  const [saveStatus, setSaveStatus]     = useState<"idle" | "saving" | "saved">("idle");
  const [sessionDeleted, setSessionDeleted] = useState(false);
  const [gameEnded, setGameEnded]       = useState(false);

  const [recentReactions, setRecentReactions] = useState<ReactionEvent[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const isMyTurn =
    !!session && !!myPlayer && session.current_turn_player_id === myPlayer.id;

  const prevIsMyTurnRef = useRef(false);

  // ── 로그 재조회 (Realtime 실패 보완) ────────────────────────────────
  const refreshLogs = useCallback(async (sid: string) => {
    try {
      const res = await fetch(`/api/trpg/game/session/${sid}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs as ActionLog[]);
        setSession((prev) => prev ? { ...prev, ...(data.session as GameSession) } : prev);
      }
    } catch { /* 무시 */ }
  }, []);

  // ── 선택지 생성 ──────────────────────────────────────────────────────
  const fetchChoices = useCallback(
    async (sid: string, pid: string, lid: string): Promise<{ is_fallback?: boolean } | undefined> => {
      setChoicesLoading(true);
      try {
        const res = await fetch("/api/trpg/game/choices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sid, player_id: pid, local_id: lid }),
        });
        const data = await res.json();
        setChoices(data.choices ?? FALLBACK_CHOICES);
        return { is_fallback: data.is_fallback ?? false };
      } catch {
        setChoices(FALLBACK_CHOICES);
        return { is_fallback: true };
      } finally {
        setChoicesLoading(false);
      }
    },
    []
  );

  // ── 초기 로드 ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!localId) return;

    async function load() {
      try {
        const res = await fetch(`/api/trpg/game/session/${sessionId}`);
        if (res.status === 404 || res.status === 403) {
          router.replace("/trpg/lobby");
          return;
        }
        const data = await res.json();

        setSession(data.session as GameSession);
        setScenario(data.scenario as Scenario);
        setPlayers(data.players as RawPlayer[]);
        setLogs(data.logs as ActionLog[]);
        setNpcs((data.npcs ?? []) as NpcPersona[]);

        const me = (data.players as RawPlayer[]).find((p) => p.user_id === localId);
        if (!me) {
          router.replace("/trpg/lobby");
          return;
        }
        setMyPlayer(me);
      } catch {
        setError("게임 데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [sessionId, localId, router]);

  // ── 내 턴 시작 감지 → 선택지 자동 생성 ─────────────────────────────
  useEffect(() => {
    if (isMyTurn && !prevIsMyTurnRef.current && myPlayer && localId) {
      fetchChoices(sessionId, myPlayer.id, localId).then((result) => {
        if (result?.is_fallback) {
          toast.info("선택지 생성에 오류가 발생했습니다. 기본 선택지로 진행합니다.");
        }
      });
    }
    prevIsMyTurnRef.current = isMyTurn;
  }, [isMyTurn, myPlayer, localId, sessionId, fetchChoices]);

  // ── Realtime 구독 ────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`game:${sessionId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "Action_Log",
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        setLogs((prev) => [...prev, payload.new as ActionLog]);
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "Game_Session",
        filter: `id=eq.${sessionId}`,
      }, (payload) => {
        const updated = payload.new as Partial<GameSession>;
        if (updated.status === "abandoned") {
          setSessionDeleted(true);
          return;
        }
        if (updated.status === "completed" || updated.quest_tracker?.ended) {
          setGameEnded(true);
        }
        setSession((prev) =>
          prev ? { ...prev, ...updated } : prev
        );
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "Player_Character",
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const updated = payload.new as RawPlayer;
        setPlayers((prev) =>
          prev.map((p) => p.id === updated.id ? { ...p, stats: updated.stats, inventory: updated.inventory } : p)
        );
        setMyPlayer((prev) =>
          prev && prev.id === updated.id ? { ...prev, stats: updated.stats, inventory: updated.inventory } : prev
        );
      })
      .on("broadcast", { event: "reaction" }, (payload) => {
        const reaction = payload.payload as Omit<ReactionEvent, "id">;
        const id = crypto.randomUUID();
        setRecentReactions((prev) => [...prev, { ...reaction, id }]);
        setTimeout(() => {
          setRecentReactions((prev) => prev.filter((r) => r.id !== id));
        }, 3500);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // ── 행동 제출 ────────────────────────────────────────────────────────
  // diceCheck가 있으면 → 즉시 오버레이 (Phase 1 API 생략)
  // diceCheck 없으면  → Phase 1 API 경유 (GM이 판정 여부 결정)
  const submitAction = useCallback(
    async (
      content: string,
      type: "choice" | "free_input",
      diceCheck?: { dc: number; check_label: string; action_category?: string },
      actionCategory?: string
    ) => {
      if (!myPlayer || !localId || isSubmitting) return;

      // 선택지에 주사위 정보가 이미 있으면 API 없이 즉시 오버레이
      if (diceCheck) {
        setChoices([]);
        setPendingDice({
          dc: diceCheck.dc,
          modifier: JOB_MODIFIERS[myPlayer.job] ?? 0,
          check_label: diceCheck.check_label,
          action_content: content,
          action_type: type,
          action_category: diceCheck.action_category,
        });

        // Fire-and-forget: 다른 플레이어에게 주사위 굴리는 중 표시
        fetch(`/api/trpg/game/${sessionId}/turn-state`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selected_label: content,
            player_name: myPlayer.player_name,
            local_id: localId,
            player_id: myPlayer.id,
          }),
        }).catch(() => {});
        return;
      }

      // 주사위 정보 없음 → Phase 1 API (GM 판정 + 필요 시 오버레이)
      setIsSubmitting(true);
      setChoices([]);
      try {
        const res = await fetch("/api/trpg/game/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            player_id: myPlayer.id,
            local_id: localId,
            action_type: type,
            content,
            action_category: actionCategory,
          }),
        });
        if (!res.ok) {
          toast.error("행동 처리 중 오류가 발생했습니다. 다시 시도해 주세요.");
          setIsSubmitting(false);
          return;
        }
        const data = await res.json();

        if (data.gm_error) {
          toast.warning("GM이 일시적으로 응답하지 않았습니다. 자동으로 진행됩니다.");
        }
        if (data.session_ended) {
          setGameEnded(true);
        }

        if (data.needs_dice_check) {
          setPendingDice({
            dc: data.dc,
            modifier: JOB_MODIFIERS[myPlayer.job] ?? 0,
            check_label: data.check_label,
            action_content: content,
            action_type: type,
            action_category: data.action_category,
          });

          // Fire-and-forget: 다른 플레이어에게 주사위 굴리는 중 표시
          fetch(`/api/trpg/game/${sessionId}/turn-state`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              selected_label: content,
              player_name: myPlayer.player_name,
              local_id: localId,
              player_id: myPlayer.id,
            }),
          }).catch(() => {});
          setIsSubmitting(false);
        } else {
          await refreshLogs(sessionId);
          if (data.next_choices?.length > 0) {
            setChoices(data.next_choices);
          } else {
            const fallback = await fetchChoices(sessionId, myPlayer.id, localId);
            if (fallback?.is_fallback) {
              toast.info("선택지 생성에 오류가 발생했습니다. 기본 선택지로 진행합니다.");
            }
          }
          setIsSubmitting(false);
        }
      } catch {
        setIsSubmitting(false);
      }
    },
    [sessionId, myPlayer, localId, isSubmitting, fetchChoices, refreshLogs]
  );

  // ── 오버레이 닫기: 클라이언트 rolled 값으로 Phase 2 API 호출 ─────────
  const resolveAndContinue = useCallback(
    async (rolled: number) => {
      if (!pendingDice || !myPlayer || !localId) return;

      // 오버레이 즉시 닫고, resolve API 대기 중 로딩 표시
      const captured = pendingDice;
      setPendingDice(null);
      setIsSubmitting(true);

      try {
        const res = await fetch("/api/trpg/game/action/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            player_id: myPlayer.id,
            local_id: localId,
            action_content: captured.action_content,
            action_type: captured.action_type,
            dc: captured.dc,
            rolled,
            action_category: captured.action_category,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(data?.error ?? "주사위 결과 처리 중 오류가 발생했습니다.");
        } else if (data?.gm_error) {
          toast.warning("GM이 일시적으로 응답하지 않았습니다. 자동으로 진행됩니다.");
        }
        if (data?.session_ended) {
          setGameEnded(true);
        }
        await refreshLogs(sessionId);
        if (data?.next_choices?.length > 0) {
          setChoices(data.next_choices);
        } else {
          const fallback = await fetchChoices(sessionId, myPlayer.id, localId);
          if (fallback?.is_fallback) {
            toast.info("선택지 생성에 오류가 발생했습니다. 기본 선택지로 진행합니다.");
          }
        }
        setIsSubmitting(false);
      } catch {
        toast.error("주사위 결과 처리 중 오류가 발생했습니다.");
        await refreshLogs(sessionId);
        fetchChoices(sessionId, myPlayer.id, localId);
        setIsSubmitting(false);
      }
    },
    [pendingDice, myPlayer, localId, sessionId, fetchChoices, refreshLogs]
  );

  // ── 방장 여부 ─────────────────────────────────────────────────────────
  const amIHost = !!session && !!myPlayer && session.host_player_id === myPlayer.id;

  // ── 나가기 ────────────────────────────────────────────────────────────
  const leaveRoom = useCallback(async () => {
    if (!localId) return;
    await fetch(`/api/trpg/sessions/${sessionId}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ localId }),
    });
    router.replace("/trpg/lobby");
  }, [sessionId, localId, router]);

  // ── 저장 ──────────────────────────────────────────────────────────────
  const saveGame = useCallback(async () => {
    if (!localId) return;
    setSaveStatus("saving");
    try {
      await fetch(`/api/trpg/sessions/${sessionId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localId }),
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("idle");
    }
  }, [sessionId, localId]);

  // ── 감정 반응 전송 (Realtime broadcast) ──────────────────────────────
  const sendReaction = useCallback((emoji: string) => {
    if (!channelRef.current || !myPlayer) return;
    channelRef.current.send({
      type: "broadcast",
      event: "reaction",
      payload: { playerId: myPlayer.id, playerName: myPlayer.player_name, emoji },
    }).catch(() => {});
  }, [myPlayer]);

  // ── 지원 선언 ──────────────────────────────────────────────────────────
  const declareAssist = useCallback(async () => {
    if (!myPlayer || !localId) return;
    await fetch("/api/trpg/game/assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, player_id: myPlayer.id, local_id: localId }),
    });
  }, [sessionId, myPlayer, localId]);

  // ── 방 제거 ───────────────────────────────────────────────────────────
  const deleteRoom = useCallback(async () => {
    if (!localId) return;
    await fetch(`/api/trpg/sessions/${sessionId}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ localId }),
    });
    // 호스트 자신도 Realtime으로 abandoned 상태를 수신하여 모달이 뜸
  }, [sessionId, localId]);

  return {
    session,
    scenario,
    players,
    npcs,
    logs,
    myPlayer,
    isMyTurn,
    amIHost,
    choices,
    choicesLoading,
    isSubmitting,
    loading,
    error,
    submitAction,
    pendingDice,
    resolveAndContinue,
    saveStatus,
    sessionDeleted,
    gameEnded,
    leaveRoom,
    saveGame,
    deleteRoom,
    recentReactions,
    sendReaction,
    declareAssist,
  };
}
