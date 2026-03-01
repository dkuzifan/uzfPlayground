"use client";

import { useTurnTimer } from "@/hooks/useTurnTimer";

interface TurnIndicatorProps {
  currentPlayerName: string | null;
  timeoutAt: string | null;
  turnNumber: number;
  onTimeout: () => void;
}

export default function TurnIndicator({
  currentPlayerName,
  timeoutAt,
  turnNumber,
  onTimeout,
}: TurnIndicatorProps) {
  const secondsLeft = useTurnTimer(timeoutAt, onTimeout);

  const timerColor =
    secondsLeft > 15 ? "text-green-400" : secondsLeft > 5 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-neutral-400">턴 #{turnNumber}</span>
        {timeoutAt && (
          <span className={`text-sm font-bold tabular-nums ${timerColor}`}>
            {secondsLeft}s
          </span>
        )}
      </div>
      <div className="text-sm font-medium text-white">
        {currentPlayerName ? (
          <>
            <span className="text-yellow-400">{currentPlayerName}</span>의 턴
          </>
        ) : (
          "대기 중..."
        )}
      </div>
    </div>
  );
}
