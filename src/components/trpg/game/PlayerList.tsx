import type { RawPlayer } from "@/lib/types/game";

interface Props {
  players: RawPlayer[];
  currentTurnPlayerId: string | null;
  myPlayerId: string | null;
}

function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const ratio = maxHp > 0 ? hp / maxHp : 0;
  const color =
    ratio >= 0.6 ? "bg-green-500" : ratio >= 0.3 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="mt-1 h-1 w-full rounded-full bg-white/10">
      <div
        className={`h-1 rounded-full ${color}`}
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
    </div>
  );
}

export default function PlayerList({ players, currentTurnPlayerId, myPlayerId }: Props) {
  return (
    <div className="flex-1 space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-medium text-neutral-500">플레이어</p>
      {players.map((p) => {
        const isCurrentTurn = p.id === currentTurnPlayerId;
        const isMe = p.id === myPlayerId;
        return (
          <div
            key={p.id}
            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
              isCurrentTurn
                ? "border border-indigo-500/40 bg-indigo-600/20"
                : "bg-white/5"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`font-medium ${isCurrentTurn ? "text-indigo-300" : "text-white"}`}
              >
                {p.player_name}
                {isMe && <span className="ml-1 text-xs text-neutral-500">(나)</span>}
              </span>
              <span className="text-xs text-neutral-400">
                {p.stats.hp}/{p.stats.max_hp}
              </span>
            </div>
            <HpBar hp={p.stats.hp} maxHp={p.stats.max_hp} />
            {isCurrentTurn && (
              <p className="mt-0.5 text-xs text-indigo-400">턴 진행 중</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
