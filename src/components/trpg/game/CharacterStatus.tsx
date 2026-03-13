import type { RawPlayer } from "@/lib/types/game";

interface Props {
  player: RawPlayer | null;
}

function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const ratio = maxHp > 0 ? hp / maxHp : 0;
  const color =
    ratio >= 0.6 ? "bg-green-500" : ratio >= 0.3 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="h-2 w-full rounded-full bg-black/10 dark:bg-white/10">
      <div
        className={`h-2 rounded-full transition-all ${color}`}
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
    </div>
  );
}

export default function CharacterStatus({ player }: Props) {
  if (!player) {
    return (
      <div className="rounded-xl border border-black/10 bg-black/[0.04] p-4 dark:border-white/10 dark:bg-white/5">
        <p className="text-xs text-neutral-500">캐릭터 정보 없음</p>
      </div>
    );
  }

  const { stats } = player;

  return (
    <div className="space-y-3 rounded-xl border border-black/10 bg-black/[0.04] p-4 dark:border-white/10 dark:bg-white/5">
      <div>
        <p className="text-xs text-neutral-500">내 캐릭터</p>
        <p className="font-semibold text-neutral-900 dark:text-white">{player.character_name}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{player.job}</p>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-neutral-500 dark:text-neutral-400">HP</span>
          <span className="font-medium text-neutral-900 dark:text-white">
            {stats.hp} / {stats.max_hp}
          </span>
        </div>
        <HpBar hp={stats.hp} maxHp={stats.max_hp} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "ATK", value: stats.attack },
          { label: "DEF", value: stats.defense },
          { label: "SPD", value: stats.speed },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-md bg-black/5 py-1.5 dark:bg-white/5">
            <p className="text-sm font-bold text-neutral-900 dark:text-white">{value}</p>
            <p className="text-xs text-neutral-500">{label}</p>
          </div>
        ))}
      </div>

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
