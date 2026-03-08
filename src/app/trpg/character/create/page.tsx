"use client";

import { useRouter } from "next/navigation";
import { useGuestProfile } from "@/hooks/useGuestProfile";
import PersonalityTest from "@/components/trpg/onboarding/PersonalityTest";
import type { PersonalityProfile, CharacterJob } from "@/lib/types/character";

export default function CharacterCreatePage() {
  const router = useRouter();
  const { profile, saveProfile } = useGuestProfile();

  function handleComplete(personality: PersonalityProfile, characterName: string, job: CharacterJob) {
    saveProfile({
      ...(profile ?? {}),
      nickname: profile?.nickname ?? characterName,
      avatarIndex: profile?.avatarIndex ?? 0,
      characterName,
      job,
      personality,
      characterCreated: true,
    });
    router.push("/trpg/lobby");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">캐릭터 생성</h1>
        <p className="mt-2 text-neutral-500 dark:text-neutral-400">
          성향 테스트를 완료하면 AI가 당신의 성향에 맞는 선택지를 제공합니다.
        </p>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
        <PersonalityTest onComplete={handleComplete} />
      </div>
    </div>
  );
}
