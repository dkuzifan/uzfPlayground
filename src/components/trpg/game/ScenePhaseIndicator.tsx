"use client";

import type { ScenePhase } from "@/lib/types/game";

interface Props {
  phase: ScenePhase;
}

const PHASE_CONFIG: Record<
  ScenePhase,
  { label: string; icon: string; bar: string; text: string; border: string }
> = {
  exploration: {
    label: "탐색",
    icon: "🔍",
    bar: "bg-sky-400",
    text: "text-sky-700 dark:text-sky-300",
    border: "border-sky-200/60 dark:border-sky-700/40",
  },
  tension: {
    label: "긴장",
    icon: "⚡",
    bar: "bg-amber-400",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200/60 dark:border-amber-700/40",
  },
  climax: {
    label: "클라이맥스",
    icon: "🔥",
    bar: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200/60 dark:border-red-700/40",
  },
  resolution: {
    label: "해소",
    icon: "🌅",
    bar: "bg-violet-400",
    text: "text-violet-700 dark:text-violet-300",
    border: "border-violet-200/60 dark:border-violet-700/40",
  },
};

const PHASE_ORDER: ScenePhase[] = ["exploration", "tension", "climax", "resolution"];

export default function ScenePhaseIndicator({ phase }: Props) {
  const config = PHASE_CONFIG[phase];
  const currentIdx = PHASE_ORDER.indexOf(phase);

  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 ${config.border} bg-white/40 dark:bg-black/20`}>
      <span className="text-sm">{config.icon}</span>
      <span className={`text-xs font-semibold ${config.text}`}>{config.label}</span>
      <div className="ml-auto flex gap-1">
        {PHASE_ORDER.map((p, i) => (
          <div
            key={p}
            className={`h-1.5 w-5 rounded-full transition-all ${
              i <= currentIdx ? config.bar : "bg-black/10 dark:bg-white/10"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
