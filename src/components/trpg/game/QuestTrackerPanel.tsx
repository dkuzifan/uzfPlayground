import type { QuestTracker, ScenarioObjectives } from "@/lib/trpg/types/game";

interface Props {
  questTracker: QuestTracker | null;
  objectives?: ScenarioObjectives | null;
}

function ClockBar({ value, max, color }: { value: number; max: number; color: "green" | "red" | "yellow" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const barColor = color === "green" ? "#4ade80" : color === "red" ? "#f87171" : "#fbbf24";
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--skin-bg-secondary)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <span className="w-10 text-right text-[10px]" style={{ color: "var(--skin-text-muted)" }}>
        {value}/{max}
      </span>
    </div>
  );
}

export default function QuestTrackerPanel({ questTracker, objectives }: Props) {
  if (!questTracker) return null;

  const secondaryList = objectives?.secondary ?? [];
  const doomPct = questTracker.doom_clock_max > 0
    ? Math.round((questTracker.doom_clock / questTracker.doom_clock_max) * 100)
    : 0;
  const doomColor: "green" | "red" | "yellow" = doomPct >= 80 ? "red" : doomPct >= 50 ? "yellow" : "green";

  if (questTracker.ended) {
    return (
      <div className="rounded-xl p-3" style={{ border: "1px solid var(--skin-border)", background: "var(--skin-bg-card)" }}>
        <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "var(--skin-text-muted)", fontFamily: "var(--skin-font-display)" }}>
          퀘스트
        </p>
        <p className="mt-1 text-xs font-semibold" style={{ color: "var(--skin-accent)" }}>게임 종료</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-3" style={{ border: "1px solid var(--skin-border)", background: "var(--skin-bg-card)" }}>
      <p
        className="mb-2.5 text-[9px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--skin-text-muted)", fontFamily: "var(--skin-font-display)" }}
      >
        목표
      </p>

      <div className="space-y-3">
        {/* 메인 목표 */}
        <div>
          <p className="mb-1 text-[11px]" style={{ color: "var(--skin-text)" }}>
            {objectives ? objectives.primary.target_description : "메인 목표"}
          </p>
          <ClockBar
            value={questTracker.primary_progress}
            max={objectives ? objectives.primary.progress_max : 4}
            color="green"
          />
        </div>

        {/* 서브 목표 */}
        {secondaryList.map((obj, i) => (
          <div key={i}>
            <p className="mb-1 text-[11px]" style={{ color: "var(--skin-text-muted)" }}>
              {obj.is_hidden ? "???" : obj.target_description}
            </p>
            <ClockBar value={questTracker.secondary_progress[i] ?? 0} max={obj.progress_max} color="yellow" />
          </div>
        ))}

        {/* 비밀 목표 */}
        {objectives?.secret && (
          <div>
            <p className="mb-1 text-[11px]" style={{ color: "var(--skin-text-muted)" }}>
              {questTracker.secret_triggered ? objectives.secret.target_description : "??? (숨겨진 목표)"}
            </p>
            {questTracker.secret_triggered && (
              <span className="text-[10px] font-semibold" style={{ color: "var(--skin-accent)" }}>달성!</span>
            )}
          </div>
        )}

        {/* 위기 시계 */}
        <div className="pt-2" style={{ borderTop: "1px solid var(--skin-border)" }}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px]" style={{ color: "var(--skin-text-muted)" }}>위기 시계</span>
            {doomPct >= 80 && (
              <span className="text-[10px] font-semibold text-red-400">위험!</span>
            )}
          </div>
          <ClockBar value={questTracker.doom_clock} max={questTracker.doom_clock_max} color={doomColor} />
        </div>
      </div>
    </div>
  );
}
