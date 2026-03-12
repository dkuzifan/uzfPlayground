import type { QuestTracker, ScenarioObjectives } from "@/lib/types/game";

interface Props {
  questTracker: QuestTracker | null;
  objectives?: ScenarioObjectives | null;
}

function ClockBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: "green" | "red" | "yellow";
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const colorClass =
    color === "green"
      ? "bg-emerald-400 dark:bg-emerald-500"
      : color === "red"
      ? "bg-red-400 dark:bg-red-500"
      : "bg-yellow-400 dark:bg-yellow-500";

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right text-[10px] text-neutral-500 dark:text-neutral-400">
        {value}/{max}
      </span>
    </div>
  );
}

export default function QuestTrackerPanel({ questTracker, objectives }: Props) {
  if (!questTracker) return null;

  // objectives가 없으면 간략 표시만
  const hasObjectives = !!objectives;
  const secondaryList = objectives?.secondary ?? [];

  const doomPct =
    questTracker.doom_clock_max > 0
      ? Math.round((questTracker.doom_clock / questTracker.doom_clock_max) * 100)
      : 0;

  const doomColor: "green" | "red" | "yellow" =
    doomPct >= 80 ? "red" : doomPct >= 50 ? "yellow" : "green";

  if (questTracker.ended) {
    return (
      <div className="rounded-xl border border-black/10 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          퀘스트
        </h3>
        <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          게임 종료
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-black/10 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        퀘스트
      </h3>

      <div className="space-y-3">
        {/* 메인 목표 */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              {hasObjectives
                ? objectives!.primary.target_description
                : "메인 목표"}
            </span>
          </div>
          <ClockBar
            value={questTracker.primary_progress}
            max={hasObjectives ? objectives!.primary.progress_max : 4}
            color="green"
          />
        </div>

        {/* 서브 목표 */}
        {secondaryList.map((obj, i) => {
          const prog = questTracker.secondary_progress[i] ?? 0;
          return (
            <div key={i}>
              <div className="mb-1">
                <span className="text-xs text-neutral-600 dark:text-neutral-400">
                  {obj.is_hidden ? "???" : obj.target_description}
                </span>
              </div>
              <ClockBar value={prog} max={obj.progress_max} color="yellow" />
            </div>
          );
        })}

        {/* 비밀 목표 */}
        {objectives?.secret && (
          <div>
            <div className="mb-1">
              <span className="text-xs text-neutral-500 dark:text-neutral-500">
                {questTracker.secret_triggered
                  ? objectives.secret.target_description
                  : "??? (숨겨진 목표)"}
              </span>
            </div>
            {questTracker.secret_triggered && (
              <span className="text-xs font-semibold text-emerald-500">달성!</span>
            )}
          </div>
        )}

        {/* 위기 시계 (Doom Clock) */}
        <div className="border-t border-black/5 pt-2 dark:border-white/5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-neutral-500 dark:text-neutral-500">
              위기 시계
            </span>
            {doomPct >= 80 && (
              <span className="text-[10px] font-semibold text-red-500">위험!</span>
            )}
          </div>
          <ClockBar
            value={questTracker.doom_clock}
            max={questTracker.doom_clock_max}
            color={doomColor}
          />
        </div>
      </div>
    </div>
  );
}
