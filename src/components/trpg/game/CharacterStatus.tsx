"use client";

import { useState } from "react";
import Portrait from "./Portrait";
import type { RawPlayer } from "@/lib/trpg/types/game";
import type { StatSchemaEntry } from "@/lib/trpg/types/character";
import { normalizeStatSchema } from "@/lib/trpg/types/character";

interface Props {
  player: RawPlayer | null;
  statSchema?: StatSchemaEntry[] | string[] | null;
  sessionTheme?: string;
}

function StatBar({ label, icon, value, maxValue, color }: {
  label: string; icon: string; value: number; maxValue: number;
  color: StatSchemaEntry["color"];
}) {
  const ratio = maxValue > 0 ? Math.min(value / maxValue, 1) : 0;
  const barColor =
    color === "green"
      ? ratio >= 0.6 ? "#4ade80" : ratio >= 0.3 ? "#fbbf24" : "#f87171"
      : { blue: "#60a5fa", yellow: "#fbbf24", red: "#f87171", purple: "#a78bfa", neutral: "#a3a3a3" }[color] ?? "#a3a3a3";

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span style={{ color: "var(--skin-text-muted)" }}>{icon} {label}</span>
        <span style={{ color: "var(--skin-text)" }}>{value} / {maxValue}</span>
      </div>
      <div className="h-1.5 w-full rounded-full" style={{ background: "var(--skin-bg-secondary)" }}>
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${Math.round(ratio * 100)}%`, background: barColor }}
        />
      </div>
    </div>
  );
}

export default function CharacterStatus({ player, statSchema, sessionTheme }: Props) {
  const [generating, setGenerating] = useState(false);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);

  if (!player) {
    return (
      <div
        className="rounded-xl p-4"
        style={{ border: "1px solid var(--skin-border)", background: "var(--skin-bg-card)" }}
      >
        <p className="text-xs" style={{ color: "var(--skin-text-muted)" }}>캐릭터 정보 없음</p>
      </div>
    );
  }

  const { stats } = player;
  const schema = normalizeStatSchema(statSchema);
  const barStats = schema.filter((s) => s.display === "bar");
  const otherStats = schema.filter((s) => s.display !== "bar");
  const existingPortrait = (player as unknown as { portrait_url?: string }).portrait_url ?? portraitUrl;

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/trpg/portraits/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterName: player!.character_name,
          job: player!.job,
          theme: sessionTheme,
          playerId: player!.id,
        }),
      });
      const data = await res.json();
      if (data.url) setPortraitUrl(data.url);
    } catch { /* ignore */ }
    finally { setGenerating(false); }
  }

  return (
    <div
      className="rounded-xl p-4"
      style={{ border: "1px solid var(--skin-border)", background: "var(--skin-bg-card)" }}
    >
      {/* 초상화 + 이름 */}
      <div className="mb-3 flex items-center gap-3">
        <Portrait
          portraitUrl={existingPortrait}
          seed={player.character_name}
          size={52}
          onGenerate={handleGenerate}
          generating={generating}
        />
        <div className="min-w-0">
          <p
            className="truncate text-sm font-bold"
            style={{ color: "var(--skin-text)", fontFamily: "var(--skin-font-display)" }}
          >
            {player.character_name}
          </p>
          <p className="text-xs" style={{ color: "var(--skin-accent)" }}>{player.job}</p>
          {(player as unknown as { personality?: { mbti?: string } }).personality?.mbti && (
            <p className="text-[10px]" style={{ color: "var(--skin-text-muted)" }}>
              {(player as unknown as { personality?: { mbti?: string } }).personality?.mbti}
            </p>
          )}
        </div>
      </div>

      {/* Bar 스탯 */}
      <div className="space-y-2.5">
        {barStats.map((stat) => {
          const value = stats[stat.key] ?? 0;
          const maxValue = stat.max_key ? (stats[stat.max_key] ?? value) : value;
          return (
            <StatBar key={stat.key} label={stat.label} icon={stat.icon}
              value={value} maxValue={maxValue} color={stat.color} />
          );
        })}
      </div>

      {/* Counter/Number 스탯 그리드 */}
      {otherStats.length > 0 && (
        <div
          className="mt-3 grid gap-1.5 text-center"
          style={{ gridTemplateColumns: `repeat(${Math.min(otherStats.length, 3)}, minmax(0, 1fr))` }}
        >
          {otherStats.map((stat) => {
            const value = stats[stat.key] ?? 0;
            const maxValue = stat.max_key ? (stats[stat.max_key] ?? null) : null;
            return (
              <div
                key={stat.key}
                className="rounded-lg py-1.5"
                style={{ background: "var(--skin-bg-secondary)", border: "1px solid var(--skin-border)" }}
              >
                <p className="text-sm font-bold" style={{ color: "var(--skin-text)" }}>
                  {stat.display === "counter" && maxValue !== null ? `${value}/${maxValue}` : value}
                </p>
                <p className="text-[10px]" style={{ color: "var(--skin-text-muted)" }}>
                  {stat.icon} {stat.label}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* 소지품 */}
      {player.inventory && player.inventory.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[10px]" style={{ color: "var(--skin-text-muted)" }}>🎒 소지품</p>
          <div className="flex flex-wrap gap-1">
            {player.inventory.map((item, i) => (
              <span
                key={i}
                className="rounded-full px-2 py-0.5 text-[10px]"
                style={{ background: "var(--skin-accent-glow)", color: "var(--skin-accent)", border: "1px solid var(--skin-border)" }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
