"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ActionLog, ActionChoice, RawPlayer, GameSession, Scenario, DiceResolveResult } from "@/lib/types/game";

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
  check_label: string;
  action_content: string;
  action_type: "choice" | "free_input";
}

export function useGameScreen(sessionId: string, localId: string | null) {
  const router = useRouter();
  const [session, setSession] = useState<GameSession | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [players, setPlayers] = useState<RawPlayer[]>([]);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [myPlayer, setMyPlayer] = useState<RawPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<ActionChoice[]>([]);
  const [choicesLoading, setChoicesLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingDice, setPendingDice] = useState<PendingDice | null>(null);
  const [diceResult, setDiceResult] = useState<DiceResolveResult | null>(null);

  const isMyTurn =
    !!session && !!myPlayer && session.current_turn_player_id === myPlayer.id;

  // 이전 턴 상태 추적 (내 턴이 새로 시작될 때만 선택지 생성)
  const prevIsMyTurnRef = useRef(false);

  // ── 선택지 생성 ─────────────────────────────────────────────────────
  const fetchChoices = useCallback(
    async (sid: string, pid: string, lid: string) => {
      setChoicesLoading(true);
      try {
        const res = await fetch("/api/trpg/game/choices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sid, player_id: pid, local_id: lid }),
        });
        const data = await res.json();
        setChoices(data.choices ?? FALLBACK_CHOICES);
      } catch {
        setChoices(FALLBACK_CHOICES);
      } finally {
        setChoicesLoading(false);
      }
    },
    []
  );

  // ── 초기 로드 ────────────────────────────────────────────────────────
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

  // ── 내 턴 시작 감지 → 선택지 자동 생성 ──────────────────────────────
  useEffect(() => {
    if (isMyTurn && !prevIsMyTurnRef.current && myPlayer && localId) {
      fetchChoices(sessionId, myPlayer.id, localId);
    }
    prevIsMyTurnRef.current = isMyTurn;
  }, [isMyTurn, myPlayer, localId, sessionId, fetchChoices]);

  // ── Realtime 3채널 구독 ──────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`game:${sessionId}`)
      // 1. Action_Log INSERT → 채팅 로그 추가
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "Action_Log",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setLogs((prev) => [...prev, payload.new as ActionLog]);
        }
      )
      // 2. Game_Session UPDATE → 현재 턴 갱신
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "Game_Session",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          setSession((prev) =>
            prev ? { ...prev, ...(payload.new as Partial<GameSession>) } : prev
          );
        }
      )
      // 3. Player_Character UPDATE → HP 갱신
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "Player_Character",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const updated = payload.new as RawPlayer;
          setPlayers((prev) =>
            prev.map((p) =>
              p.id === updated.id ? { ...p, stats: updated.stats } : p
            )
          );
          setMyPlayer((prev) =>
            prev && prev.id === updated.id
              ? { ...prev, stats: updated.stats }
              : prev
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // ── 행동 제출 (Phase 1) ──────────────────────────────────────────────
  const submitAction = useCallback(
    async (content: string, type: "choice" | "free_input") => {
      if (!myPlayer || !localId || isSubmitting) return;
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
          }),
        });
        if (!res.ok) {
          setIsSubmitting(false);
          return;
        }
        const data = await res.json();

        if (data.needs_dice_check) {
          // Phase 1: 주사위 판정 필요 → 오버레이 표시
          setPendingDice({
            dc: data.dc,
            check_label: data.check_label,
            action_content: content,
            action_type: type,
          });
          setIsSubmitting(false);
        } else {
          // 판정 불필요 → 기존 플로우
          await fetchChoices(sessionId, myPlayer.id, localId);
          setIsSubmitting(false);
        }
      } catch {
        setIsSubmitting(false);
      }
    },
    [sessionId, myPlayer, localId, isSubmitting, fetchChoices]
  );

  // ── 주사위 판정 실행 (Phase 2) ────────────────────────────────────────
  const resolveDice = useCallback(async () => {
    if (!pendingDice || !myPlayer || !localId) return;
    try {
      const res = await fetch("/api/trpg/game/action/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          player_id: myPlayer.id,
          local_id: localId,
          action_content: pendingDice.action_content,
          action_type: pendingDice.action_type,
          dc: pendingDice.dc,
        }),
      });
      if (!res.ok) return;
      const data = await res.json() as DiceResolveResult;
      setDiceResult(data);
    } catch {
      // 실패 시 오버레이 닫기
      setPendingDice(null);
      setDiceResult(null);
    }
  }, [pendingDice, myPlayer, localId, sessionId]);

  // ── 오버레이 닫기 + 선택지 갱신 ─────────────────────────────────────
  const clearDiceResult = useCallback(() => {
    setPendingDice(null);
    setDiceResult(null);
    if (myPlayer && localId) {
      fetchChoices(sessionId, myPlayer.id, localId);
    }
  }, [myPlayer, localId, sessionId, fetchChoices]);

  return {
    session,
    scenario,
    players,
    logs,
    myPlayer,
    isMyTurn,
    choices,
    choicesLoading,
    isSubmitting,
    loading,
    error,
    submitAction,
    pendingDice,
    diceResult,
    resolveDice,
    clearDiceResult,
  };
}
