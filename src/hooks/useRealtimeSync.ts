"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { ActionLog } from "@/lib/types/game";

interface UseRealtimeSyncOptions {
  sessionId: string;
  onNewLog: (log: ActionLog) => void;
  onSessionUpdate: (updates: Record<string, unknown>) => void;
}

export function useRealtimeSync({
  sessionId,
  onNewLog,
  onSessionUpdate,
}: UseRealtimeSyncOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "Action_Log",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          onNewLog(payload.new as ActionLog);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "Game_Session",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          onSessionUpdate(payload.new as Record<string, unknown>);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, onNewLog, onSessionUpdate]);
}
