"use client";

import { useState } from "react";
import type { ActionChoice, ActiveTurnState } from "@/lib/trpg/types/game";

interface Props {
  isMyTurn: boolean;
  currentTurnName: string;
  choices: ActionChoice[];
  choicesLoading: boolean;
  isSubmitting: boolean;
  activeTurnState?: ActiveTurnState | null;
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
  activeTurnState,
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
      <div className="rounded-xl border border-black/10 bg-black/[0.04] p-4 dark:border-white/10 dark:bg-white/5 space-y-3">
        {/* 상태 헤더 */}
        <div className="flex items-center gap-2 text-neutral-500">
          {activeTurnState?.status === "rolling" ? (
            <>
              <span className="animate-bounce text-lg">🎲</span>
              <span className="text-sm">
                {activeTurnState.player_name}이(가) 주사위를 굴리고 있습니다...
              </span>
            </>
          ) : activeTurnState?.status === "choosing" ? (
            <>
              <span className="animate-pulse text-lg">◌</span>
              <span className="text-sm">
                {activeTurnState.player_name}이(가) 행동을 선택하고 있습니다...
              </span>
            </>
          ) : (
            <>
              <span className="animate-pulse text-lg">◌</span>
              <span className="text-sm">
                {currentTurnName ? `${currentTurnName}의 턴입니다...` : "대기 중..."}
              </span>
            </>
          )}
        </div>

        {/* rolling 상태: 선택한 행동 표시 */}
        {activeTurnState?.status === "rolling" && activeTurnState.selected_label && (
          <div className="rounded-lg border border-amber-300/40 bg-amber-50/50 px-4 py-2.5 dark:border-amber-500/20 dark:bg-amber-500/5">
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-0.5">선택한 행동</p>
            <p className="text-sm text-neutral-800 dark:text-neutral-200">{activeTurnState.selected_label}</p>
          </div>
        )}

        {/* choosing 상태: 선택지 목록 표시 (read-only) */}
        {activeTurnState?.status === "choosing" && activeTurnState.choices.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-neutral-400">제시된 선택지</p>
            {activeTurnState.choices.map((choice, i) => (
              <div
                key={choice.id ?? i}
                className="w-full rounded-lg border border-black/8 bg-white/40 px-4 py-2.5 dark:border-white/8 dark:bg-white/[0.03]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {choice.label}
                  </span>
                  {choice.dice_check && (
                    <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      🎲 {choice.dice_check.check_label ?? "판정 필요"}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
                  {choice.description}
                </p>
              </div>
            ))}
          </div>
        )}
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
                    🎲 {choice.dice_check.check_label ?? "판정 필요"}
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
