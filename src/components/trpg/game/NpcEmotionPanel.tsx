"use client";

import type { NpcPersona } from "@/lib/trpg/types/game";
import type { NpcDynamicState } from "@/lib/trpg/types/character";

interface Props {
  npcs: NpcPersona[];
  dynamicStates: Record<string, NpcDynamicState> | null;
}

function StatBar({
  label,
  value,
  min = 0,
  max = 100,
  colorClass,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  colorClass: string;
}) {
  const ratio = (value - min) / (max - min);
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-xs">
        <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
        <span className="font-medium tabular-nums text-neutral-700 dark:text-neutral-300">
          {value}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10">
        <div
          className={`h-1.5 rounded-full transition-all ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function AffinityBar({ value }: { value: number }) {
  // -100~100 → 가운데 기준 좌우로 뻗는 바
  const isPositive = value >= 0;
  const pct = Math.round(Math.abs(value));
  const colorClass = isPositive
    ? "bg-rose-400 dark:bg-rose-500"
    : "bg-slate-400 dark:bg-slate-500";
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-xs">
        <span className="text-neutral-500 dark:text-neutral-400">호감도</span>
        <span
          className={`font-medium tabular-nums ${
            isPositive
              ? "text-rose-600 dark:text-rose-400"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          {value > 0 ? "+" : ""}
          {value}
        </span>
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10">
        {/* 중앙선 */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-black/20 dark:bg-white/20" />
        {isPositive ? (
          <div
            className={`absolute inset-y-0 left-1/2 rounded-full ${colorClass}`}
            style={{ width: `${pct / 2}%` }}
          />
        ) : (
          <div
            className={`absolute inset-y-0 rounded-full ${colorClass}`}
            style={{ right: "50%", width: `${pct / 2}%` }}
          />
        )}
      </div>
    </div>
  );
}

function TrustBar({ value }: { value: number }) {
  const isPositive = value >= 0;
  const pct = Math.round(Math.abs(value));
  const colorClass = isPositive
    ? "bg-sky-400 dark:bg-sky-500"
    : "bg-orange-400 dark:bg-orange-500";
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-xs">
        <span className="text-neutral-500 dark:text-neutral-400">신뢰도</span>
        <span
          className={`font-medium tabular-nums ${
            isPositive
              ? "text-sky-600 dark:text-sky-400"
              : "text-orange-600 dark:text-orange-400"
          }`}
        >
          {value > 0 ? "+" : ""}
          {value}
        </span>
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10">
        <div className="absolute inset-y-0 left-1/2 w-px bg-black/20 dark:bg-white/20" />
        {isPositive ? (
          <div
            className={`absolute inset-y-0 left-1/2 rounded-full ${colorClass}`}
            style={{ width: `${pct / 2}%` }}
          />
        ) : (
          <div
            className={`absolute inset-y-0 rounded-full ${colorClass}`}
            style={{ right: "50%", width: `${pct / 2}%` }}
          />
        )}
      </div>
    </div>
  );
}

export default function NpcEmotionPanel({ npcs, dynamicStates }: Props) {
  if (npcs.length === 0 || !dynamicStates) return null;

  return (
    <div className="space-y-3 rounded-xl border border-black/10 bg-black/[0.04] p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        NPC 심리 상태
      </p>

      {npcs.map((npc) => {
        const state = dynamicStates[npc.id];
        if (!state) return null;

        const fearHigh = state.fear_survival >= 80;

        return (
          <div key={npc.id} className="space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                {npc.name}
              </span>
              {fearHigh && (
                <span className="rounded bg-red-100 px-1 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-500/20 dark:text-red-400">
                  공포
                </span>
              )}
              {state.current_mood && (
                <span className="ml-auto text-[11px] text-neutral-400 dark:text-neutral-500">
                  {state.current_mood}
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <AffinityBar value={state.affinity} />
              <TrustBar value={state.trust} />
              <StatBar
                label="스트레스"
                value={state.mental_stress}
                colorClass="bg-violet-400 dark:bg-violet-500"
              />
              <StatBar
                label="공포"
                value={state.fear_survival}
                colorClass={
                  fearHigh
                    ? "bg-red-500 dark:bg-red-500"
                    : "bg-red-300 dark:bg-red-400"
                }
              />
            </div>

            {state.power_dynamics && (
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                ⚖ {state.power_dynamics}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
