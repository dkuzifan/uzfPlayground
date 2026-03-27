import Image from "next/image";
import type { AiCharacter, AiCharacterPublic } from "@/lib/chat/types";

interface Props {
  character: AiCharacter | AiCharacterPublic;
  onClick: () => void;
}

const INITIAL_COLORS = [
  "bg-purple-500/20 text-purple-400",
  "bg-blue-500/20 text-blue-400",
  "bg-emerald-500/20 text-emerald-400",
  "bg-amber-500/20 text-amber-400",
  "bg-rose-500/20 text-rose-400",
];

function getColorClass(name: string) {
  const idx = name.charCodeAt(0) % INITIAL_COLORS.length;
  return INITIAL_COLORS[idx];
}

export default function CharacterCard({ character, onClick }: Props) {
  const initial = character.name.charAt(0);
  const colorClass = getColorClass(character.name);
  const isPublic = character.is_public;

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.07]"
    >
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full">
        {character.portrait_url ? (
          <Image
            src={character.portrait_url}
            alt={character.name}
            fill
            className="object-cover"
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center text-lg font-bold ${colorClass}`}
          >
            {initial}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white">{character.name}</div>
        {character.bio && (
          <div className="mt-0.5 truncate text-xs text-neutral-500">{character.bio}</div>
        )}
      </div>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
          isPublic
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            : "border-purple-500/30 bg-purple-500/10 text-purple-400"
        }`}
      >
        {isPublic ? "공개" : "비공개"}
      </span>
    </button>
  );
}
