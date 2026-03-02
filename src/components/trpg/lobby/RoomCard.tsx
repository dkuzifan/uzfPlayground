import Link from "next/link";
import type { LobbySession } from "@/lib/types/lobby";

interface RoomCardProps {
  session: LobbySession;
}

export default function RoomCard({ session }: RoomCardProps) {
  const isFull = session.player_count >= session.max_players;

  return (
    <div
      className={`rounded-xl border border-black/10 bg-black/[0.04] p-5 transition-colors hover:border-black/20 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 ${
        isFull ? "opacity-60" : ""
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="font-semibold text-neutral-900 dark:text-white">{session.room_name}</h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            isFull
              ? "bg-red-500/15 text-red-600 dark:bg-red-500/20 dark:text-red-400"
              : "bg-green-500/15 text-green-700 dark:bg-green-500/20 dark:text-green-400"
          }`}
        >
          {isFull ? "만석" : "참여 가능"}
        </span>
      </div>
      <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">{session.scenario_title}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-500">
          👥 {session.player_count}/{session.max_players}명
        </span>
        {isFull ? (
          <span className="rounded-md px-3 py-1.5 text-xs font-medium text-neutral-400">
            입장 불가
          </span>
        ) : (
          <Link
            href={`/trpg/lobby/${session.id}`}
            className="rounded-md bg-black/8 px-3 py-1.5 text-xs font-medium text-neutral-900 transition-colors hover:bg-black/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          >
            입장
          </Link>
        )}
      </div>
    </div>
  );
}
