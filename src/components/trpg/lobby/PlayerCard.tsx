import { AVATAR_COLORS } from "@/lib/types/lobby";
import type { WaitingPlayer } from "@/lib/types/lobby";

interface PlayerCardProps {
  player: WaitingPlayer;
}

export default function PlayerCard({ player }: PlayerCardProps) {
  const colorClass = AVATAR_COLORS[player.avatarIndex] ?? AVATAR_COLORS[0];

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
        player.isHost
          ? "border-yellow-500/30 bg-yellow-500/5"
          : "border-black/10 bg-black/[0.04] dark:border-white/10 dark:bg-white/5"
      }`}
    >
      <div className={`h-10 w-10 flex-shrink-0 rounded-full ${colorClass}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
          {player.nickname}
        </p>
        <p className="text-xs text-neutral-500">{player.isHost ? "방장" : "참여자"}</p>
      </div>
      {player.isHost && <span className="text-lg">👑</span>}
    </div>
  );
}
