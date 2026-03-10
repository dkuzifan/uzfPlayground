"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import PersonalityTest from "@/components/trpg/onboarding/PersonalityTest";
import type { PersonalityProfile, CharacterJob, CharacterCreationConfig } from "@/lib/types/character";
import { AVATAR_COLORS } from "@/lib/types/lobby";

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  localId: string;
  scenarioTitle: string;
  config: CharacterCreationConfig;
  onSaveProfile: (nickname: string, avatarIndex: number) => void;
}

type Step = "character" | "avatar";

interface CharacterData {
  personality: PersonalityProfile;
  characterName: string;
  job: CharacterJob;
}

const JOB_EMOJI: Record<string, string> = {
  warrior: "⚔️", mage: "🔮", rogue: "🗡️", cleric: "✨",
  ranger: "🏹", paladin: "🛡️", bard: "🎶", adventurer: "🎒",
  detective: "🔍", journalist: "📰", doctor: "🩺", lawyer: "⚖️", civilian: "👤",
};

export default function JoinRoomModal({
  open, onClose, sessionId, localId, scenarioTitle, config, onSaveProfile,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("character");
  const [characterData, setCharacterData] = useState<CharacterData | null>(null);
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableJobs = config.available_jobs.map((job) => ({
    value: job,
    label: config.job_labels[job] ?? job,
    icon: JOB_EMOJI[job],
    desc: undefined,
  }));

  function handleClose() {
    setStep("character");
    setCharacterData(null);
    setError(null);
    onClose();
  }

  function handleCharacterComplete(
    personality: PersonalityProfile,
    characterName: string,
    job: CharacterJob
  ) {
    setCharacterData({ personality, characterName, job });
    setStep("avatar");
  }

  async function handleJoin() {
    if (!characterData) return;
    setJoining(true);
    setError(null);

    try {
      const res = await fetch(`/api/trpg/sessions/${sessionId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localId,
          nickname: characterData.characterName,
          avatarIndex,
          characterName: characterData.characterName,
          job: characterData.job,
          personality: characterData.personality,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "입장에 실패했습니다.");
        return;
      }

      onSaveProfile(characterData.characterName, avatarIndex);
      router.push(`/trpg/lobby/${sessionId}`);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setJoining(false);
    }
  }

  const titles: Record<Step, string> = {
    character: `캐릭터 생성 · ${scenarioTitle}`,
    avatar: "아바타 선택",
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={titles[step]}
      size={step === "character" ? "lg" : "md"}
    >
      {/* ── Step 1: 캐릭터 생성 (성향 테스트) ── */}
      {step === "character" && (
        <PersonalityTest
          onComplete={handleCharacterComplete}
          availableJobs={availableJobs}
          characterNameHint={config.character_name_hint}
        />
      )}

      {/* ── Step 2: 아바타 + 입장 ── */}
      {step === "avatar" && characterData && (
        <div className="space-y-5">
          {/* 캐릭터 요약 */}
          <div className="rounded-xl border border-black/8 bg-neutral-50 px-4 py-3 text-xs dark:border-white/8 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">캐릭터</span>
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                {characterData.characterName}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-neutral-500">직업</span>
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                {config.job_labels[characterData.job] ?? characterData.job}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-neutral-500">성향</span>
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                {characterData.personality.summary}
              </span>
            </div>
          </div>

          {/* 아바타 색상 */}
          <div>
            <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">
              아바타 색상
            </p>
            <div className="flex gap-2">
              {Object.entries(AVATAR_COLORS).map(([idx, cls]) => (
                <button
                  key={idx}
                  onClick={() => setAvatarIndex(Number(idx))}
                  className={`h-8 w-8 rounded-full transition ${cls} ${
                    avatarIndex === Number(idx)
                      ? "ring-2 ring-yellow-400 ring-offset-2 dark:ring-offset-neutral-900"
                      : "opacity-60 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setStep("character")}
              className="flex-1 rounded-lg border border-black/10 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              ← 이전
            </button>
            <button
              onClick={handleJoin}
              disabled={joining}
              className="flex-1 rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              {joining ? "입장 중…" : "입장하기"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
