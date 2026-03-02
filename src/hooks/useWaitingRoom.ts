"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { parseAvatarIndex } from "@/lib/types/lobby";
import type { WaitingPlayer } from "@/lib/types/lobby";

interface WaitingRoomState {
  players: WaitingPlayer[];
  hostPcId: string | null;
  maxPlayers: number;
  roomName: string;
  loading: boolean;
}

export function useWaitingRoom(sessionId: string, localId: string) {
  const router = useRouter();
  const [state, setState] = useState<WaitingRoomState>({
    players: [],
    hostPcId: null,
    maxPlayers: 4,
    roomName: "",
    loading: true,
  });
  const channelsRef = useRef<RealtimeChannel[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    const supabase = createClient();

    async function init() {
      // 1. 세션 정보 조회
      const { data: session } = await supabase
        .from("Game_Session")
        .select("room_name, max_players, host_player_id, status")
        .eq("id", sessionId)
        .single();

      if (!session) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }

      // 이미 in_progress면 바로 게임 화면으로
      if (session.status === "in_progress") {
        router.push(`/trpg/game/${sessionId}`);
        return;
      }

      const hostPcId = session.host_player_id;

      // 2. 현재 참여자 목록 초기 fetch
      const { data: pcs } = await supabase
        .from("Player_Character")
        .select("id, player_name, personality_summary")
        .eq("session_id", sessionId);

      const initialPlayers = (pcs ?? []).map((pc) =>
        toWaitingPlayer(pc, hostPcId)
      );

      setState({
        players: initialPlayers,
        hostPcId,
        maxPlayers: session.max_players,
        roomName: session.room_name,
        loading: false,
      });

      // 3. 채널 1 — 참여자 변동 구독
      const playerChannel = supabase
        .channel(`waiting-players:${sessionId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "Player_Character",
            filter: `session_id=eq.${sessionId}`,
          },
          (payload) => {
            if (payload.eventType === "INSERT") {
              const newPlayer = toWaitingPlayer(
                payload.new as { id: string; player_name: string; personality_summary: string | null },
                hostPcId
              );
              setState((s) => ({
                ...s,
                players: s.players.some((p) => p.id === newPlayer.id)
                  ? s.players
                  : [...s.players, newPlayer],
              }));
            } else if (payload.eventType === "DELETE") {
              const deletedId = (payload.old as { id: string }).id;
              setState((s) => ({
                ...s,
                players: s.players.filter((p) => p.id !== deletedId),
              }));
            }
          }
        )
        .subscribe();

      // 4. 채널 2 — 세션 상태 변경 구독
      const sessionChannel = supabase
        .channel(`session-status:${sessionId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "Game_Session",
            filter: `id=eq.${sessionId}`,
          },
          (payload) => {
            const updated = payload.new as { status: string };
            if (updated.status === "in_progress") {
              router.push(`/trpg/game/${sessionId}`);
            }
          }
        )
        .subscribe();

      channelsRef.current = [playerChannel, sessionChannel];
    }

    init();

    return () => {
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
      channelsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // localId로 내가 방장인지 확인
  const myPcId = state.players.find(
    (p) => state.hostPcId && p.id === state.hostPcId
  )?.id;
  const isHost = state.hostPcId !== null && myPcId === state.hostPcId &&
    state.players.some(
      (p) => p.id === state.hostPcId
    );

  // 좀 더 정확하게: localId 기반으로 내 PC 찾기는 API에서만 가능
  // 여기서는 hostPcId가 현재 플레이어 목록에 있는지로 방장 여부 표시
  // 실제 방장 여부는 start API가 서버에서 검증함
  void isHost; // suppress unused warning — 컴포넌트에서 localId 직접 비교

  return {
    ...state,
    localId,
  };
}

function toWaitingPlayer(
  pc: { id: string; player_name: string; personality_summary: string | null },
  hostPcId: string | null
): WaitingPlayer {
  return {
    id: pc.id,
    nickname: pc.player_name,
    avatarIndex: parseAvatarIndex(pc.personality_summary),
    isHost: pc.id === hostPcId,
  };
}
