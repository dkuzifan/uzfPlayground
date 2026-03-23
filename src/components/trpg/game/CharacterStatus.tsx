import type { RawPlayer } from "@/lib/types/game";
import type { StatSchemaEntry } from "@/lib/types/character";
import { normalizeStatSchema } from "@/lib/types/character";

interface Props {
  player: RawPlayer | null;
  statSchema?: StatSchemaEntry[] | string[] | null;
}

const BAR_COLORS: Record<StatSchemaEntry["color"], string> = {
  green: "bg-green-500",
  blue: "bg-blue-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  neutral: "bg-neutral-400",
};

function StatBar({
  label,
  icon,
  value,
  maxValue,
  color,
}: {
  label: string;
  icon: string;
  value: number;
  maxValue: number;
  color: StatSchemaEntry["color"];
}) {
  const ratio = maxValue > 0 ? Math.min(value / maxValue, 1) : 0;
  const barColor =
    color === "green"
      ? ratio >= 0.6
        ? "bg-green-500"
        : ratio >= 0.3
          ? "bg-yellow-500"
          : "bg-red-500"
      : BAR_COLORS[color];
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-neutral-500 dark:text-neutral-400">
          {icon} {label}
        </span>
        <span className="font-medium text-neutral-900 dark:text-white">
          {value} / {maxValue}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-black/10 dark:bg-white/10">
        <div
          className={`h-2 rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function CharacterStatus({ player, statSchema }: Props) {
  if (!player) {
    return (
      <div className="rounded-xl border border-black/10 bg-black/[0.04] p-4 dark:border-white/10 dark:bg-white/5">
        <p className="text-xs text-neutral-500">캐릭터 정보 없음</p>
      </div>
    );
  }

  const { stats } = player;
  const schema = normalizeStatSchema(statSchema);

  // Separate bar stats from counter/number stats
  const barStats = schema.filter((s) => s.display === "bar");
  const otherStats = schema.filter((s) => s.display !== "bar");

  return (
    <div className="space-y-3 rounded-xl border border-black/10 bg-black/[0.04] p-4 dark:border-white/10 dark:bg-white/5">
      <div>
        <p className="text-xs text-neutral-500">내 캐릭터</p>
        <p className="font-semibold text-neutral-900 dark:text-white">{player.character_name}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{player.job}</p>
      </div>

      {/* Bar stats (HP, sanity, etc.) */}
      {barStats.map((stat) => {
        const value = stats[stat.key] ?? 0;
        const maxValue = stat.max_key ? (stats[stat.max_key] ?? value) : value;
        return (
          <StatBar
            key={stat.key}
            label={stat.label}
            icon={stat.icon}
            value={value}
            maxValue={maxValue}
            color={stat.color}
          />
        );
      })}

      {/* Counter / number stats grid */}
      {otherStats.length > 0 && (
        <div
          className="grid gap-2 text-center"
          style={{ gridTemplateColumns: `repeat(${Math.min(otherStats.length, 3)}, minmax(0, 1fr))` }}
        >
          {otherStats.map((stat) => {
            const value = stats[stat.key] ?? 0;
            const maxValue = stat.max_key ? (stats[stat.max_key] ?? null) : null;
            return (
              <div key={stat.key} className="rounded-md bg-black/5 py-1.5 dark:bg-white/5">
                <p className="text-sm font-bold text-neutral-900 dark:text-white">
                  {stat.display === "counter" && maxValue !== null
                    ? `${value}/${maxValue}`
                    : value}
                </p>
                <p className="text-xs text-neutral-500">
                  {stat.icon} {stat.label}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {player.inventory && player.inventory.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-neutral-500 dark:text-neutral-400">🎒 소지품</p>
          <div className="flex flex-wrap gap-1">
            {player.inventory.map((item, i) => (
              <span
                key={i}
                className="rounded-full bg-amber-100/80 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
