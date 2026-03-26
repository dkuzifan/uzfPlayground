import type { RawPlayer } from "@/lib/trpg/types/game";
import type { StatSchemaEntry } from "@/lib/trpg/types/character";
import { normalizeStatSchema } from "@/lib/trpg/types/character";

interface Props {
  players: RawPlayer[];
  currentTurnPlayerId: string | null;
  myPlayerId: string | null;
  statSchema?: StatSchemaEntry[] | string[] | null;
}

export default function PlayerList({ players, currentTurnPlayerId, myPlayerId, statSchema }: Props) {
  const schema = normalizeStatSchema(statSchema);
  const primaryBarStat = schema.find((s) => s.display === "bar");

  return (
    <div
      className="rounded-xl p-3"
      style={{ border: "1px solid var(--skin-border)", background: "var(--skin-bg-card)" }}
    >
      <p
        className="mb-2 text-[9px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--skin-text-muted)", fontFamily: "var(--skin-font-display)" }}
      >
        참여자
      </p>

      <div className="flex flex-col gap-1.5">
        {players.map((p) => {
          const isCurrentTurn = p.id === currentTurnPlayerId;
          const isMe = p.id === myPlayerId;
          const primaryValue = primaryBarStat ? (p.stats[primaryBarStat.key] ?? 0) : null;
          const primaryMax = primaryBarStat?.max_key
            ? (p.stats[primaryBarStat.max_key] ?? primaryValue ?? 0)
            : (primaryValue ?? 0);
          const ratio = primaryMax > 0 && primaryValue !== null ? Math.min(primaryValue / primaryMax, 1) : 0;
          const hpColor = ratio >= 0.6 ? "#4ade80" : ratio >= 0.3 ? "#fbbf24" : "#f87171";

          return (
            <div
              key={p.id}
              className="rounded-lg px-2.5 py-2 transition-all"
              style={{
                background: isCurrentTurn ? "var(--skin-accent-glow)" : "var(--skin-bg-secondary)",
                border: `1px solid ${isCurrentTurn ? "var(--skin-accent)" : "var(--skin-border)"}`,
                boxShadow: isCurrentTurn ? "0 0 8px var(--skin-accent-glow)" : "none",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-xs font-medium"
                  style={{ color: isCurrentTurn ? "var(--skin-accent)" : "var(--skin-text)" }}
                >
                  {p.player_name}
                  {isMe && (
                    <span className="ml-1 text-[10px]" style={{ color: "var(--skin-text-muted)" }}>(나)</span>
                  )}
                </span>
                {primaryBarStat && primaryValue !== null && (
                  <span className="text-[10px]" style={{ color: "var(--skin-text-muted)" }}>
                    {primaryBarStat.icon} {primaryValue}/{primaryMax}
                  </span>
                )}
              </div>

              {primaryBarStat && primaryValue !== null && (
                <div className="mt-1 h-1 rounded-full" style={{ background: "var(--skin-bg-card)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.round(ratio * 100)}%`, background: hpColor }}
                  />
                </div>
              )}

              {isCurrentTurn && (
                <p className="mt-0.5 text-[10px]" style={{ color: "var(--skin-accent)" }}>
                  턴 진행 중
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
