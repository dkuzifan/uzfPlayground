import Link from "next/link";
import type { GameSession, Scenario } from "@/lib/types/game";

interface RoomCardProps {
  session: GameSession & { scenario: Scenario; player_count: number };
}

export default function RoomCard({ session }: RoomCardProps) {
  const isFull = session.player_count >= session.max_players;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 transition-colors hover:border-white/20">
      <div className="mb-2 flex items-start justify-between">
        <h3 className="font-semibold text-white">{session.room_name}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            isFull
              ? "bg-red-500/20 text-red-400"
              : "bg-green-500/20 text-green-400"
          }`}
        >
          {isFull ? "만석" : "참여 가능"}
        </span>
      </div>
      <p className="mb-4 text-sm text-neutral-400">{session.scenario.title}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-500">
          {session.player_count}/{session.max_players}명
        </span>
        {!isFull && (
          <Link
            href={`/trpg/lobby/${session.id}`}
            className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
          >
            입장
          </Link>
        )}
      </div>
    </div>
  );
}
