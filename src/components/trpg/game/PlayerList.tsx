import type { RawPlayer } from "@/lib/trpg/types/game";
import type { StatSchemaEntry } from "@/lib/trpg/types/character";
import { normalizeStatSchema } from "@/lib/trpg/types/character";

interface Props {
  players: RawPlayer[];
  currentTurnPlayerId: string | null;
  myPlayerId: string | null;
  statSchema?: StatSchemaEntry[] | string[] | null;
}

function StatBar({ value, maxValue }: { value: number; maxValue: number }) {
  const ratio = maxValue > 0 ? Math.min(value / maxValue, 1) : 0;
  const color =
    ratio >= 0.6 ? "bg-green-500" : ratio >= 0.3 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="mt-1 h-1 w-full rounded-full bg-black/10 dark:bg-white/10">
      <div
        className={`h-1 rounded-full ${color}`}
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
    </div>
  );
}

export default function PlayerList({ players, currentTurnPlayerId, myPlayerId, statSchema }: Props) {
  const schema = normalizeStatSchema(statSchema);
  const primaryBarStat = schema.find((s) => s.display === "bar");

  return (
    <div className="flex-1 space-y-2 rounded-xl border border-black/10 bg-black/[0.04] p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-xs font-medium text-neutral-500">플레이어</p>
      {players.map((p) => {
        const isCurrentTurn = p.id === currentTurnPlayerId;
        const isMe = p.id === myPlayerId;

        const primaryValue = primaryBarStat ? (p.stats[primaryBarStat.key] ?? 0) : null;
        const primaryMax = primaryBarStat?.max_key
          ? (p.stats[primaryBarStat.max_key] ?? primaryValue ?? 0)
          : (primaryValue ?? 0);

        return (
          <div
            key={p.id}
            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
              isCurrentTurn
                ? "border border-indigo-500/40 bg-indigo-600/20"
                : "bg-black/5 dark:bg-white/5"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`font-medium ${
                  isCurrentTurn
                    ? "text-indigo-700 dark:text-indigo-300"
                    : "text-neutral-900 dark:text-white"
                }`}
              >
                {p.player_name}
                {isMe && <span className="ml-1 text-xs text-neutral-500">(나)</span>}
              </span>
              {primaryBarStat && primaryValue !== null && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {primaryBarStat.icon} {primaryValue}/{primaryMax}
                </span>
              )}
            </div>
            {primaryBarStat && primaryValue !== null && (
              <StatBar value={primaryValue} maxValue={primaryMax} />
            )}
            {isCurrentTurn && (
              <p className="mt-0.5 text-xs text-indigo-600 dark:text-indigo-400">턴 진행 중</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
