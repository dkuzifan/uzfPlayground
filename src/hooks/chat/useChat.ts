"use client";

import { useState, useCallback, useRef } from "react";
import type { ChatMessage, EmotionState } from "@/lib/chat/types";

const DEFAULT_EMOTION: EmotionState = { mood: "neutral", intensity: 0 };

export function useChat(characterId: string, localId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [emotionState, setEmotionState] = useState<EmotionState>(DEFAULT_EMOTION);
  const abortRef = useRef<AbortController | null>(null);

  const loadHistory = useCallback(async () => {
    if (historyLoaded) return;
    try {
      const res = await fetch(
        `/api/chat/${characterId}/messages?local_id=${encodeURIComponent(localId)}`
      );
      if (!res.ok) return;
      const { messages: hist } = await res.json();
      setMessages(hist ?? []);
      // 마지막 AI 메시지의 감정 상태 복원
      const lastAi = [...(hist ?? [])].reverse().find((m: ChatMessage) => m.role === "assistant");
      if (lastAi?.emotion_state) setEmotionState(lastAi.emotion_state);
      setHistoryLoaded(true);
    } catch (e) {
      console.error("[useChat] loadHistory:", e);
    }
  }, [characterId, localId, historyLoaded]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      // 낙관적 업데이트
      const optimisticUser: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        character_id: characterId,
        local_id: localId,
        role: "user",
        content: content.trim(),
        emotion_state: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUser]);
      setIsLoading(true);

      try {
        abortRef.current = new AbortController();
        const res = await fetch(`/api/chat/${characterId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ local_id: localId, content: content.trim() }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) throw new Error("응답 실패");
        const { id, reply, emotion_state, created_at } = await res.json();

        const aiMsg: ChatMessage = {
          id,
          character_id: characterId,
          local_id: localId,
          role: "assistant",
          content: reply,
          emotion_state,
          created_at,
        };

        setMessages((prev) => [...prev, aiMsg]);
        if (emotion_state) setEmotionState(emotion_state);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        console.error("[useChat] sendMessage:", e);
        // 낙관적 메시지 제거
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
      } finally {
        setIsLoading(false);
      }
    },
    [characterId, localId, isLoading]
  );

  const clearMessages = useCallback(async () => {
    try {
      await fetch(`/api/chat/${characterId}/messages`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ local_id: localId }),
      });
      setMessages([]);
      setEmotionState(DEFAULT_EMOTION);
    } catch (e) {
      console.error("[useChat] clearMessages:", e);
    }
  }, [characterId, localId]);

  return { messages, isLoading, emotionState, historyLoaded, loadHistory, sendMessage, clearMessages };
}
