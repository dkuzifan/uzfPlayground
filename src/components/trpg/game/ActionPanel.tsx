"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ActionChoice, ActiveTurnState } from "@/lib/trpg/types/game";

const REACTION_EMOJIS = ["😨", "😮", "🎉", "⚠️", "🔥"];

interface Props {
  isMyTurn: boolean;
  currentTurnName: string;
  choices: ActionChoice[];
  choicesLoading: boolean;
  isSubmitting: boolean;
  activeTurnState?: ActiveTurnState | null;
  myPlayerId?: string;
  onSubmit: (
    content: string,
    type: "choice" | "free_input",
    diceCheck?: { dc: number; check_label: string; action_category?: string },
    actionCategory?: string
  ) => Promise<void>;
  onReact?: (emoji: string) => void;
  onAssist?: () => Promise<void>;
}

// DC → 난이도 레이블/색상
function DcBadge({ check }: { check: ActionChoice["dice_check"] }) {
  if (!check) return null;
  const posStyle =
    check.position === "desperate"
      ? { color: "#f87171", background: "rgba(239,68,68,0.12)", label: "불리" }
      : check.position === "controlled"
        ? { color: "#4ade80", background: "rgba(74,222,128,0.12)", label: "유리" }
        : null;
  return (
    <div className="flex items-center gap-1.5">
      {posStyle && (
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ color: posStyle.color, background: posStyle.background }}
        >
          {posStyle.label}
        </span>
      )}
      <span
        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{ color: "#fbbf24", background: "rgba(251,191,36,0.12)" }}
      >
        🎲 {check.check_label ?? "판정 필요"}
      </span>
    </div>
  );
}

export default function ActionPanel({
  isMyTurn,
  currentTurnName,
  choices,
  choicesLoading,
  isSubmitting,
  activeTurnState,
  myPlayerId,
  onSubmit,
  onReact,
  onAssist,
}: Props) {
  const [freeInput, setFreeInput] = useState("");
  const [assistDone, setAssistDone] = useState(false);

  // ── GM 판정 중 ──────────────────────────────────────
  if (isSubmitting) {
    return (
      <div
        className="rounded-xl px-4 py-3 text-center"
        style={{ border: "1px solid var(--skin-accent)", background: "var(--skin-accent-glow)" }}
      >
        <div className="flex items-center justify-center gap-2">
          <span className="animate-spin text-lg">⚙</span>
          <span className="text-sm" style={{ color: "var(--skin-accent)" }}>GM이 판정 중...</span>
        </div>
      </div>
    );
  }

  // ── 내 턴 아님 ──────────────────────────────────────
  if (!isMyTurn) {
    return (
      <div
        className="space-y-3 rounded-xl p-4"
        style={{ border: "1px solid var(--skin-border)", background: "var(--skin-bg-card)" }}
      >
        {/* 상태 헤더 */}
        <div className="flex items-center gap-2" style={{ color: "var(--skin-text-muted)" }}>
          {activeTurnState?.status === "rolling" ? (
            <>
              <span className="animate-bounce text-lg">🎲</span>
              <span className="text-sm">{activeTurnState.player_name}이(가) 주사위를 굴리고 있습니다...</span>
            </>
          ) : activeTurnState?.status === "choosing" ? (
            <>
              <span className="animate-pulse text-lg" style={{ color: "var(--skin-accent)" }}>◌</span>
              <span className="text-sm">{activeTurnState.player_name}이(가) 행동을 선택하고 있습니다...</span>
            </>
          ) : (
            <>
              <span className="animate-pulse text-lg">◌</span>
              <span className="text-sm">{currentTurnName ? `${currentTurnName}의 턴입니다...` : "대기 중..."}</span>
            </>
          )}
        </div>

        {/* rolling: 선택한 행동 */}
        {activeTurnState?.status === "rolling" && activeTurnState.selected_label && (
          <div
            className="rounded-lg px-4 py-2.5"
            style={{ border: "1px solid rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.06)" }}
          >
            <p className="mb-0.5 text-xs font-medium text-yellow-400">선택한 행동</p>
            <p className="text-sm" style={{ color: "var(--skin-text)" }}>{activeTurnState.selected_label}</p>
          </div>
        )}

        {/* choosing: 선택지 목록 read-only */}
        {activeTurnState?.status === "choosing" && activeTurnState.choices.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: "var(--skin-text-muted)" }}>제시된 선택지</p>
            {activeTurnState.choices.map((choice, i) => (
              <div
                key={choice.id ?? i}
                className="rounded-lg px-4 py-2.5"
                style={{ border: "1px solid var(--skin-border)", background: "var(--skin-bg-secondary)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium" style={{ color: "var(--skin-text)" }}>{choice.label}</span>
                  <DcBadge check={choice.dice_check} />
                </div>
                <p className="mt-0.5 text-xs" style={{ color: "var(--skin-text-muted)" }}>{choice.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* 지원 선언 */}
        {onAssist && activeTurnState?.status === "choosing" && (() => {
          const alreadyAssisted =
            assistDone ||
            (myPlayerId ? (activeTurnState.assist_player_ids ?? []).includes(myPlayerId) : false);
          const assistCount = activeTurnState.assist_count ?? 0;
          return (
            <button
              onClick={async () => { if (!alreadyAssisted) { await onAssist(); setAssistDone(true); } }}
              disabled={alreadyAssisted}
              className="w-full rounded-lg py-2 text-xs font-medium transition"
              style={{
                border: `1px solid ${alreadyAssisted ? "var(--skin-accent)" : "var(--skin-border)"}`,
                background: alreadyAssisted ? "var(--skin-accent-glow)" : "transparent",
                color: alreadyAssisted ? "var(--skin-accent)" : "var(--skin-text-muted)",
              }}
            >
              {alreadyAssisted
                ? `✓ 지원 선언됨${assistCount > 0 ? ` (${assistCount}명, 보너스 +${assistCount * 2})` : ""}`
                : `🤝 지원 선언 (+2 보너스)${assistCount > 0 ? ` · ${assistCount}명 지원 중` : ""}`}
            </button>
          );
        })()}

        {/* 감정 반응 */}
        {onReact && (
          <div className="flex justify-center gap-2 pt-1">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onReact(emoji)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-base transition hover:scale-110 active:scale-95"
                style={{ border: "1px solid var(--skin-border)", background: "var(--skin-bg-secondary)" }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── 내 턴 — 선택지 카드 ─────────────────────────────
  return (
    <div
      className="space-y-3 rounded-xl p-4"
      style={{ border: "1px solid var(--skin-accent)", background: "var(--skin-accent-glow)" }}
    >
      <p
        className="text-xs font-semibold tracking-wider"
        style={{ color: "var(--skin-accent)", fontFamily: "var(--skin-font-display)" }}
      >
        ⚔ 당신의 턴 — 행동을 선택하세요
      </p>

      {/* 선택지 카드 */}
      {choicesLoading ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl"
              style={{ background: "var(--skin-bg-secondary)" }}
            />
          ))}
        </div>
      ) : (
        <AnimatePresence>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {choices.map((choice, i) => (
              <motion.button
                key={choice.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.25 } }}
                whileHover={{ y: -5, boxShadow: "0 10px 30px var(--skin-accent-glow)" }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSubmit(choice.label, "choice", choice.dice_check, choice.action_category)}
                className="flex flex-col gap-2 rounded-xl p-3 text-left transition-colors"
                style={{
                  border: "1px solid var(--skin-border)",
                  background: "var(--skin-bg-card)",
                  cursor: "pointer",
                }}
              >
                <p
                  className="text-[10px] font-semibold tracking-widest"
                  style={{ color: "var(--skin-accent)", fontFamily: "var(--skin-font-display)" }}
                >
                  선택지 {i + 1}
                </p>
                <p className="flex-1 text-sm font-medium leading-snug" style={{ color: "var(--skin-text)" }}>
                  {choice.label}
                </p>
                {choice.description && (
                  <p className="text-xs leading-relaxed" style={{ color: "var(--skin-text-muted)" }}>
                    {choice.description}
                  </p>
                )}
                <DcBadge check={choice.dice_check} />
              </motion.button>
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* 직접 입력 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={freeInput}
          onChange={(e) => setFreeInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && freeInput.trim()) {
              onSubmit(freeInput.trim(), "free_input");
              setFreeInput("");
            }
          }}
          placeholder="직접 입력..."
          className="flex-1 rounded-lg px-3 py-2 text-sm outline-none transition"
          style={{
            border: "1px solid var(--skin-border)",
            background: "var(--skin-bg-secondary)",
            color: "var(--skin-text)",
          }}
        />
        <button
          onClick={() => {
            if (freeInput.trim()) { onSubmit(freeInput.trim(), "free_input"); setFreeInput(""); }
          }}
          disabled={!freeInput.trim()}
          className="rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-40"
          style={{ background: "var(--skin-accent)", color: "var(--skin-bg)" }}
        >
          제출
        </button>
      </div>
    </div>
  );
}
