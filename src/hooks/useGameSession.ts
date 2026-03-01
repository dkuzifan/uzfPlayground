"use client";

import { useState, useEffect, useCallback } from "react";
import type { GameSessionWithDetails, ActionLog } from "@/lib/types/game";
import { createClient } from "@/lib/supabase/client";

export function useGameSession(sessionId: string) {
  const [session, setSession] = useState<GameSessionWithDetails | null>(null);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/trpg/game/session/${sessionId}`);
      if (!res.ok) throw new Error("Failed to fetch session");
      const data = await res.json();
      setSession(data.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const submitAction = useCallback(
    async (content: string, actionType: "choice" | "free_input") => {
      const res = await fetch("/api/trpg/game/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, action_type: actionType, content }),
      });
      if (!res.ok) throw new Error("Failed to submit action");
      return res.json();
    },
    [sessionId]
  );

  return { session, logs, loading, error, submitAction, refetch: fetchSession };
}
