import type { GameSession } from "@/lib/types/game";

type QuestTracker = NonNullable<GameSession["quest_tracker"]>;

interface Props {
  questTracker: QuestTracker | null;
}

const STATUS_LABEL: Record<QuestTracker["status"], string> = {
  IN_PROGRESS: "진행 중",
  CLEARED: "완료",
  FAILED: "실패",
};

const STATUS_COLOR: Record<QuestTracker["status"], string> = {
  IN_PROGRESS: "text-yellow-600 bg-yellow-100/80 dark:text-yellow-300 dark:bg-yellow-900/30",
  CLEARED:     "text-emerald-600 bg-emerald-100/80 dark:text-emerald-300 dark:bg-emerald-900/30",
  FAILED:      "text-red-600 bg-red-100/80 dark:text-red-300 dark:bg-red-900/30",
};

export default function QuestTrackerPanel({ questTracker }: Props) {
  if (!questTracker) return null;

  const milestoneEntries = Object.entries(questTracker.milestones ?? {});
  if (milestoneEntries.length === 0 && questTracker.status === "IN_PROGRESS") return null;

  return (
    <div className="rounded-xl border border-black/10 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          퀘스트
        </h3>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[questTracker.status]}`}>
          {STATUS_LABEL[questTracker.status]}
        </span>
      </div>

      {milestoneEntries.length > 0 && (
        <ul className="space-y-1.5">
          {milestoneEntries.map(([key, milestone]) => (
            <li key={key} className="flex items-center gap-2 text-xs">
              {milestone.type === "boolean" ? (
                <span className={milestone.value ? "text-emerald-500" : "text-neutral-400"}>
                  {milestone.value ? "✓" : "○"}
                </span>
              ) : (
                <span className="text-neutral-400">
                  {String(milestone.value)}/{milestone.target ?? "?"}
                </span>
              )}
              <span className={
                milestone.type === "boolean" && milestone.value
                  ? "text-neutral-400 line-through dark:text-neutral-500"
                  : "text-neutral-700 dark:text-neutral-300"
              }>
                {key}
              </span>
              {milestone.type === "counter" && milestone.target !== undefined && (
                <div className="ml-auto h-1.5 w-12 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                  <div
                    className="h-full rounded-full bg-yellow-400 dark:bg-yellow-500"
                    style={{ width: `${Math.min(100, (Number(milestone.value) / milestone.target) * 100)}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
