"use client";

import { useState } from "react";
import Portrait from "./Portrait";
import type { NpcPersona } from "@/lib/trpg/types/game";
import type { NpcDynamicState } from "@/lib/trpg/types/character";

interface Props {
  npcs: NpcPersona[];
  dynamicStates: Record<string, NpcDynamicState> | null;
  sessionTheme?: string;
}

function AffinityRow({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.abs(value));
  const isPos = value >= 0;
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-6 text-[9px]" style={{ color: "var(--skin-text-muted)" }}>{label}</span>
      <div className="relative h-1.5 flex-1 rounded-full" style={{ background: "var(--skin-bg-card)" }}>
        <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: "var(--skin-border)" }} />
        <div
          className="absolute inset-y-0 rounded-full transition-all duration-500"
          style={{
            background: isPos ? "#4ade80" : "#f87171",
            ...(isPos
              ? { left: "50%", width: `${pct / 2}%` }
              : { right: "50%", width: `${pct / 2}%` }),
          }}
        />
      </div>
      <span className="w-6 text-right text-[9px]" style={{ color: isPos ? "#4ade80" : "#f87171" }}>
        {value > 0 ? "+" : ""}{value}
      </span>
    </div>
  );
}

function MoodBadge({ mood, fearHigh }: { mood?: string; fearHigh: boolean }) {
  if (!mood && !fearHigh) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {fearHigh && (
        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
          style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
          공포
        </span>
      )}
      {mood && (
        <span className="text-[10px] italic" style={{ color: "var(--skin-text-muted)" }}>{mood}</span>
      )}
    </div>
  );
}

export default function NpcEmotionPanel({ npcs, dynamicStates, sessionTheme }: Props) {
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [portraitUrls, setPortraitUrls] = useState<Record<string, string>>({});

  const visibleNpcs = npcs.filter((npc) => dynamicStates?.[npc.id]);
  if (visibleNpcs.length === 0) return null;

  async function handleGenerate(npc: NpcPersona) {
    setGeneratingId(npc.id);
    try {
      const res = await fetch("/api/trpg/portraits/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterName: npc.name,
          job: npc.role,
          theme: sessionTheme,
          npcId: npc.id,
        }),
      });
      const data = await res.json();
      if (data.url) setPortraitUrls((prev) => ({ ...prev, [npc.id]: data.url }));
    } catch { /* ignore */ }
    finally { setGeneratingId(null); }
  }

  return (
    <div
      className="rounded-xl p-3"
      style={{ border: "1px solid var(--skin-border)", background: "var(--skin-bg-card)" }}
    >
      <p
        className="mb-3 text-[9px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--skin-text-muted)", fontFamily: "var(--skin-font-display)" }}
      >
        NPC 관계
      </p>

      <div className="flex flex-col gap-3">
        {visibleNpcs.map((npc) => {
          const state = dynamicStates![npc.id];
          const fearHigh = state.fear_survival >= 80;
          const existingUrl = (npc as unknown as { portrait_url?: string }).portrait_url
            ?? portraitUrls[npc.id];

          return (
            <div
              key={npc.id}
              className="flex items-start gap-2.5 rounded-lg p-2"
              style={{ background: "var(--skin-bg-secondary)", border: "1px solid var(--skin-border)" }}
            >
              {/* 초상화 */}
              <Portrait
                portraitUrl={existingUrl}
                seed={npc.name}
                size={40}
                onGenerate={() => handleGenerate(npc)}
                generating={generatingId === npc.id}
                className="flex-shrink-0"
              />

              <div className="min-w-0 flex-1">
                {/* 이름 + 역할 */}
                <div className="flex items-baseline justify-between gap-1">
                  <span
                    className="truncate text-xs font-semibold"
                    style={{ color: "var(--skin-text)", fontFamily: "var(--skin-font-display)" }}
                  >
                    {npc.name}
                  </span>
                  {npc.is_introduced && (
                    <span className="shrink-0 text-[9px]" style={{ color: "var(--skin-accent)" }}>
                      등장
                    </span>
                  )}
                </div>
                <p className="mb-1.5 text-[10px]" style={{ color: "var(--skin-text-muted)" }}>
                  {npc.role}
                </p>

                {/* 관계 바 */}
                <AffinityRow label="호감" value={state.affinity} />
                <AffinityRow label="신뢰" value={state.trust} />

                {/* 기타 심리 */}
                <div className="mt-1.5 flex gap-2">
                  <div className="flex-1">
                    <div className="mb-0.5 flex justify-between text-[9px]">
                      <span style={{ color: "var(--skin-text-muted)" }}>스트레스</span>
                      <span style={{ color: "var(--skin-text-muted)" }}>{state.mental_stress}</span>
                    </div>
                    <div className="h-1 rounded-full" style={{ background: "var(--skin-bg-card)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${state.mental_stress}%`, background: "#a78bfa" }}
                      />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="mb-0.5 flex justify-between text-[9px]">
                      <span style={{ color: "var(--skin-text-muted)" }}>공포</span>
                      <span style={{ color: fearHigh ? "#f87171" : "var(--skin-text-muted)" }}>
                        {state.fear_survival}
                      </span>
                    </div>
                    <div className="h-1 rounded-full" style={{ background: "var(--skin-bg-card)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${state.fear_survival}%`,
                          background: fearHigh ? "#ef4444" : "#fca5a5",
                        }}
                      />
                    </div>
                  </div>
                </div>

                <MoodBadge mood={state.current_mood} fearHigh={fearHigh} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
