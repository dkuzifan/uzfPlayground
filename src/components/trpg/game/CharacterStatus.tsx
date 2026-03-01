import type { PlayerCharacter } from "@/lib/types/character";

interface CharacterStatusProps {
  character: PlayerCharacter;
}

export default function CharacterStatus({ character }: CharacterStatusProps) {
  const { stats } = character;
  const hpPercent = Math.round((stats.hp / stats.max_hp) * 100);
  const hpColor =
    hpPercent > 60 ? "bg-green-500" : hpPercent > 30 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-3 text-sm font-semibold text-white">
        {character.character_name}
        <span className="ml-2 text-xs text-neutral-400">({character.job})</span>
      </h3>

      {/* HP Bar */}
      <div className="mb-3">
        <div className="mb-1 flex justify-between text-xs text-neutral-400">
          <span>HP</span>
          <span>
            {stats.hp} / {stats.max_hp}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-white/10">
          <div
            className={`h-2 rounded-full transition-all ${hpColor}`}
            style={{ width: `${hpPercent}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {[
          { label: "ATK", value: stats.attack },
          { label: "DEF", value: stats.defense },
          { label: "SPD", value: stats.speed },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-md bg-white/5 py-1">
            <div className="text-neutral-400">{label}</div>
            <div className="font-semibold text-white">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
