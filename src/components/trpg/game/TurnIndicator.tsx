interface Props {
  currentTurnName: string;
  isMyTurn: boolean;
}

export default function TurnIndicator({ currentTurnName, isMyTurn }: Props) {
  return (
    <div
      className={`rounded-xl border p-3 text-center transition-colors ${
        isMyTurn
          ? "border-indigo-500/50 bg-indigo-500/10"
          : "border-black/10 bg-black/[0.04] dark:border-white/10 dark:bg-white/5"
      }`}
    >
      <p className="mb-1 text-xs text-neutral-500">현재 턴</p>
      <p
        className={`text-sm font-bold ${
          isMyTurn
            ? "text-indigo-600 dark:text-indigo-300"
            : "text-neutral-900 dark:text-white"
        }`}
      >
        {currentTurnName || "대기 중"}
      </p>
      {isMyTurn && (
        <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-400">당신의 턴!</p>
      )}
    </div>
  );
}
