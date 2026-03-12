"use client";

import { useState } from "react";
import type { ActionChoice } from "@/lib/types/game";

interface Props {
  isMyTurn: boolean;
  currentTurnName: string;
  choices: ActionChoice[];
  choicesLoading: boolean;
  isSubmitting: boolean;
  onSubmit: (
    content: string,
    type: "choice" | "free_input",
    diceCheck?: { dc: number; check_label: string; action_category?: string },
    actionCategory?: string
  ) => Promise<void>;
}

export default function ActionPanel({
  isMyTurn,
  currentTurnName,
  choices,
  choicesLoading,
  isSubmitting,
  onSubmit,
}: Props) {
  const [freeInput, setFreeInput] = useState("");

  if (isSubmitting) {
    return (
      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-yellow-600 dark:text-yellow-400">
          <span className="animate-spin text-lg">⚙</span>
          <span className="text-sm">GM이 판정 중...</span>
        </div>
      </div>
    );
  }

  if (!isMyTurn) {
    return (
      <div className="rounded-xl border border-black/10 bg-black/[0.04] p-4 text-center dark:border-white/10 dark:bg-white/5">
        <div className="flex items-center justify-center gap-2 text-neutral-500">
          <span className="animate-pulse text-lg">◌</span>
          <span className="text-sm">
            {currentTurnName ? `${currentTurnName}의 턴입니다...` : "대기 중..."}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
      <p className="text-xs font-medium text-indigo-600 dark:text-indigo-300">
        당신의 턴 — 행동을 선택하세요
      </p>

      {choicesLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-black/10 dark:bg-white/10" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {choices.map((choice) => (
            <button
              key={choice.id}
              onClick={() => onSubmit(choice.label, "choice", choice.dice_check, choice.action_category)}
              className="w-full rounded-lg border border-black/10 bg-white/60 px-4 py-2.5 text-left text-sm transition-colors hover:border-indigo-400/50 hover:bg-indigo-50 dark:border-white/10 dark:bg-white/5 dark:hover:border-indigo-400/40 dark:hover:bg-white/10"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-neutral-900 dark:text-white">
                  {choice.label}
                </span>
                {choice.dice_check && (
                  <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:bg-amber-400/15 dark:text-amber-400">
                    ⚄ {choice.dice_check.dc} 이상 시 성공
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {choice.description}
              </p>
            </button>
          ))}
        </div>
      )}

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
          className="flex-1 rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 outline-none focus:border-indigo-500/50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-neutral-500"
        />
        <button
          onClick={() => {
            if (freeInput.trim()) {
              onSubmit(freeInput.trim(), "free_input");
              setFreeInput("");
            }
          }}
          disabled={!freeInput.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
        >
          제출
        </button>
      </div>
    </div>
  );
}
