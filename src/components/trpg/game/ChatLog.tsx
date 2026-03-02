"use client";

import { useEffect, useRef } from "react";
import type { ActionLog, DiceRoll, HpChange } from "@/lib/types/game";

interface Props {
  logs: ActionLog[];
}

const OUTCOME_STYLE: Record<
  string,
  { border: string; text: string; shadow: string; label: string }
> = {
  critical_success: {
    border: "border-yellow-400",
    text: "text-yellow-600 dark:text-yellow-400",
    shadow: "shadow-yellow-400/40",
    label: "⚡ 크리티컬 성공",
  },
  success: {
    border: "border-green-500",
    text: "text-green-600 dark:text-green-400",
    shadow: "shadow-green-400/30",
    label: "✦ 성공",
  },
  partial: {
    border: "border-orange-400",
    text: "text-orange-600 dark:text-orange-400",
    shadow: "shadow-orange-400/30",
    label: "◈ 부분 성공",
  },
  failure: {
    border: "border-red-500",
    text: "text-red-600 dark:text-red-500",
    shadow: "shadow-red-500/30",
    label: "✕ 실패",
  },
};

function DiceRollCard({ dice, outcome }: { dice: DiceRoll; outcome: string | null }) {
  const style = OUTCOME_STYLE[outcome ?? "partial"] ?? OUTCOME_STYLE.partial;
  return (
    <div
      className={`mt-2 rounded-lg border ${style.border} bg-black/10 p-3 shadow-lg dark:bg-black/30 ${style.shadow}`}
    >
      <div className="flex items-center gap-3">
        <div className={`text-3xl font-black tabular-nums ${style.text}`}>
          {dice.rolled}
        </div>
        <div className="flex-1">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            d20({dice.rolled}) + {dice.modifier} = {dice.total}
          </p>
          <p className={`text-sm font-bold ${style.text}`}>{style.label}</p>
        </div>
      </div>
    </div>
  );
}

function HpChangeCard({ changes }: { changes: HpChange[] }) {
  if (changes.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      {changes.map((c) => (
        <div
          key={c.target_id}
          className="flex items-center gap-2 rounded-md bg-black/5 px-3 py-1.5 text-sm dark:bg-white/5"
        >
          <span className="text-neutral-700 dark:text-neutral-300">{c.name}</span>
          <span className="text-neutral-500">
            {c.old_hp} → {c.new_hp}
          </span>
          <span
            className={`ml-auto font-bold ${
              c.delta < 0
                ? "text-red-500 dark:text-red-400"
                : c.delta > 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-neutral-500"
            }`}
          >
            {c.delta > 0 ? "+" : ""}
            {c.delta} HP
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ChatLog({ logs }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="flex-1 overflow-y-auto rounded-xl border border-black/10 bg-black/[0.04] p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-col gap-3">
        {logs.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-500">
            게임이 시작되었습니다.
          </p>
        )}

        {logs.map((log) => {
          if (log.speaker_type === "system") {
            return (
              <div key={log.id} className="py-1 text-center text-xs text-neutral-500">
                — {log.content} —
              </div>
            );
          }

          if (log.speaker_type === "player") {
            const diceRoll = (log.state_changes as { dice_roll?: DiceRoll }).dice_roll;
            return (
              <div key={log.id} className="flex flex-col items-end">
                <div className="max-w-[80%]">
                  <p className="mb-1 text-right text-xs text-neutral-500">
                    {log.speaker_name}
                  </p>
                  <div className="rounded-2xl rounded-tr-sm bg-indigo-600/80 px-4 py-2 text-sm text-white">
                    {log.content}
                  </div>
                  {diceRoll && <DiceRollCard dice={diceRoll} outcome={log.outcome} />}
                </div>
              </div>
            );
          }

          if (log.speaker_type === "gm") {
            const hpChanges = (log.state_changes as { hp_changes?: HpChange[] })
              .hp_changes;
            return (
              <div key={log.id} className="flex flex-col items-start">
                <div className="max-w-[90%]">
                  <p className="mb-1 text-xs text-neutral-500">🎲 GM</p>
                  <div className="rounded-2xl rounded-tl-sm bg-black/8 px-4 py-2 text-sm text-neutral-800 dark:bg-white/10 dark:text-neutral-200">
                    {log.content}
                  </div>
                  {hpChanges && hpChanges.length > 0 && (
                    <HpChangeCard changes={hpChanges} />
                  )}
                </div>
              </div>
            );
          }

          return null;
        })}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
