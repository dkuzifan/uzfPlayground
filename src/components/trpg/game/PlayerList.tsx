import type { PlayerCharacter } from "@/lib/types/character";

interface PlayerListProps {
  players: PlayerCharacter[];
  currentTurnPlayerId: string | null;
}

export default function PlayerList({ players, currentTurnPlayerId }: PlayerListProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-400">
        플레이어
      </h3>
      <ul className="flex flex-col gap-2">
        {players.map((player) => {
          const isCurrentTurn = player.id === currentTurnPlayerId;
          return (
            <li
              key={player.id}
              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                isCurrentTurn ? "bg-yellow-400/10 text-yellow-300" : "text-neutral-300"
              }`}
            >
              <span className="font-medium">{player.character_name}</span>
              <span className="text-xs text-neutral-500">
                {player.stats.hp}/{player.stats.max_hp}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
