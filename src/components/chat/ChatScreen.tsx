"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PresenceHeader from "./PresenceHeader";
import { useChat } from "@/hooks/chat/useChat";
import type { AiCharacter, AiCharacterPublic, Mood } from "@/lib/chat/types";

const MOOD_VIBE: Record<Mood, string> = {
  happy:     "밝은 분위기",
  neutral:   "조용한 분위기",
  sad:       "차분한 분위기",
  angry:     "격앙된 분위기",
  surprised: "놀란 분위기",
};

interface Props {
  character: AiCharacter | AiCharacterPublic;
  localId: string;
}

export default function ChatScreen({ character, localId }: Props) {
  const router = useRouter();
  const { messages, isLoading, emotionState, loadHistory, sendMessage, clearMessages } =
    useChat(character.id, localId);

  const [input, setInput] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  async function handleSend() {
    if (!input.trim() || isLoading) return;
    const content = input;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await sendMessage(content);
  }

  async function handleClear() {
    await clearMessages();
    setShowDeleteModal(false);
  }

  const initial = character.name.charAt(0);
  const vibe = MOOD_VIBE[emotionState.mood];

  return (
    <div className="flex h-screen flex-col bg-neutral-950">
      {/* 상단 존재감 영역 */}
      <PresenceHeader
        name={character.name}
        initial={initial}
        mood={emotionState.mood}
        vibe={vibe}
        portraitUrl={character.portrait_url}
        onBack={() => router.push("/tales/chat")}
        onMenu={() => setShowDeleteModal(true)}
      />

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="flex flex-col gap-5">
          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === "assistant" ? (
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <p className="max-w-xs text-base leading-[1.7] text-white">{msg.content}</p>
                  <span className="text-[10px] text-neutral-600">
                    {new Date(msg.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-end gap-1 opacity-55">
                  <div className="max-w-[60%] rounded-xl rounded-tr-sm bg-white/[0.08] px-3 py-2 text-sm text-neutral-300">
                    {msg.content}
                  </div>
                  <span className="pr-1 text-[10px] text-neutral-600">
                    {new Date(msg.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              )}
            </div>
          ))}

          {/* 타이핑 인디케이터 */}
          {isLoading && (
            <div className="flex justify-center">
              <div className="flex gap-1.5 items-center py-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-neutral-500 animate-bounce"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 입력창 */}
      <div className="border-t border-white/[0.06] px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="메시지를 입력하세요…"
            className="flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-purple-500 max-h-[120px]"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500 text-black transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            ➤
          </button>
        </div>
      </div>

      {/* 대화 초기화 모달 */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-[300px] rounded-2xl border border-white/10 bg-neutral-900 p-6">
            <h3 className="mb-2 text-base font-bold text-white">대화를 초기화할까요?</h3>
            <p className="mb-5 text-sm leading-relaxed text-neutral-400">
              {character.name}와의 모든 대화 기록이 삭제됩니다. 캐릭터는 유지됩니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-neutral-400"
              >
                취소
              </button>
              <button
                onClick={handleClear}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white"
              >
                초기화
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
