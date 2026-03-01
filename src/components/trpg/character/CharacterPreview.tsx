import type { CharacterCreateInput } from "@/lib/types/character";

interface CharacterPreviewProps {
  character: CharacterCreateInput;
}

export default function CharacterPreview({ character }: CharacterPreviewProps) {
  const { personality } = character;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h3 className="mb-4 text-lg font-semibold text-white">
        {character.character_name}
      </h3>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-neutral-500">직업</dt>
          <dd className="text-white">{character.job}</dd>
        </div>
        {personality.mbti && (
          <div>
            <dt className="text-xs text-neutral-500">MBTI</dt>
            <dd className="text-white">{personality.mbti}</dd>
          </div>
        )}
        {personality.enneagram && (
          <div>
            <dt className="text-xs text-neutral-500">에니어그램</dt>
            <dd className="text-white">{personality.enneagram}번</dd>
          </div>
        )}
        {personality.dnd_alignment && (
          <div>
            <dt className="text-xs text-neutral-500">D&D 성향</dt>
            <dd className="text-white">{personality.dnd_alignment}</dd>
          </div>
        )}
      </dl>

      {personality.summary && (
        <p className="mt-4 text-sm text-neutral-400">{personality.summary}</p>
      )}
    </div>
  );
}
