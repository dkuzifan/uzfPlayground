"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import PersonalityTest from "@/components/trpg/onboarding/PersonalityTest";
import type { PersonalityProfile, CharacterJob, CharacterCreationConfig } from "@/lib/trpg/types/character";
import { AVATAR_COLORS } from "@/lib/types/lobby";
import type { SavedCharacter } from "@/app/api/trpg/characters/route";

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  scenarioTitle: string;
  config: CharacterCreationConfig;
  onSaveProfile: (nickname: string, avatarIndex: number) => void;
}

type Step = "select" | "character" | "avatar";

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
  open, onClose, sessionId, scenarioTitle, config, onSaveProfile,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("select");
  const [characterData, setCharacterData] = useState<CharacterData | null>(null);
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 저장된 캐릭터 목록
  const [savedChars, setSavedChars] = useState<SavedCharacter[]>([]);
  const [loadingChars, setLoadingChars] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const ptKey = `trpg_pt_${sessionId}`;
  const [initialProgress, setInitialProgress] = useState<{ sceneIdx: number; choices: number[] } | null>(null);

  useEffect(() => {
    if (!open) return;
    try {
      const saved = localStorage.getItem(ptKey);
      if (saved) setInitialProgress(JSON.parse(saved));
    } catch { /* ignore */ }

    setLoadingChars(true);
    fetch("/api/trpg/characters")
      .then((r) => r.json())
      .then((d) => setSavedChars(d.characters ?? []))
      .catch(() => {})
      .finally(() => setLoadingChars(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function saveProgress(sceneIdx: number, choices: number[]) {
    try { localStorage.setItem(ptKey, JSON.stringify({ sceneIdx, choices })); } catch { /* ignore */ }
  }
  function clearProgress() {
    try { localStorage.removeItem(ptKey); } catch { /* ignore */ }
  }

  const availableJobs = config.available_jobs.map((job) => ({
    value: job,
    label: config.job_labels[job] ?? job,
    icon: JOB_EMOJI[job],
    desc: undefined,
  }));

  function handleClose() {
    setStep("select");
    setCharacterData(null);
    setError(null);
    onClose();
  }

  function handleSelectSaved(char: SavedCharacter) {
    const personality = {
      mbti: char.mbti ?? null,
      enneagram: char.enneagram ?? null,
      dnd_alignment: char.dnd_alignment ?? null,
      summary: char.personality_summary ?? "",
    } as PersonalityProfile;
    setCharacterData({
      personality,
      characterName: char.character_name,
      job: char.job as CharacterJob,
    });
    setStep("avatar");
  }

  async function handleDeleteChar(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/trpg/characters/${id}`, { method: "DELETE" });
      setSavedChars((prev) => prev.filter((c) => c.id !== id));
    } catch { /* ignore */ }
    finally { setDeletingId(null); }
  }

  function handleCharacterComplete(
    personality: PersonalityProfile,
    characterName: string,
    job: CharacterJob
  ) {
    clearProgress();
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
    select: `캐릭터 선택 · ${scenarioTitle}`,
    character: `새 캐릭터 만들기 · ${scenarioTitle}`,
    avatar: "아바타 선택",
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={titles[step]}
      size={step === "character" ? "lg" : "md"}
    >
      {/* ── Step 0: 저장된 캐릭터 선택 ── */}
      {step === "select" && (
        <div className="space-y-4">
          {loadingChars ? (
            <p className="py-4 text-center text-sm text-neutral-400">캐릭터 불러오는 중…</p>
          ) : savedChars.length > 0 ? (
            <>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">이전에 만든 캐릭터로 바로 입장하거나 새로 만들 수 있습니다.</p>
              <div className="space-y-2">
                {savedChars.map((char) => (
                  <div
                    key={char.id}
                    className="flex items-center gap-3 rounded-xl border border-black/8 bg-neutral-50 px-3 py-2.5 dark:border-white/8 dark:bg-white/5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">
                          {JOB_EMOJI[char.job] ?? "🎭"} {char.character_name}
                        </span>
                        <span className="shrink-0 text-xs text-neutral-400">{(config.job_labels as Record<string, string>)[char.job] ?? char.job}</span>
                      </div>
                      {char.mbti && (
                        <p className="mt-0.5 text-xs text-neutral-400">
                          {char.mbti}{char.dnd_alignment ? ` · ${char.dnd_alignment}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => handleSelectSaved(char)}
                        className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
                      >
                        이 캐릭터로
                      </button>
                      <button
                        onClick={() => handleDeleteChar(char.id)}
                        disabled={deletingId === char.id}
                        className="rounded-lg border border-black/10 px-2 py-1.5 text-xs text-neutral-400 transition hover:border-red-300 hover:text-red-500 disabled:opacity-40 dark:border-white/10"
                      >
                        {deletingId === char.id ? "…" : "삭제"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="py-2 text-center text-sm text-neutral-400">저장된 캐릭터가 없습니다.</p>
          )}

          <button
            onClick={() => setStep("character")}
            className="w-full rounded-xl border border-dashed border-black/20 py-3 text-sm text-neutral-500 transition hover:bg-neutral-50 dark:border-white/20 dark:hover:bg-white/5"
          >
            + 새 캐릭터 만들기
          </button>
        </div>
      )}

      {/* ── Step 1: 성향 테스트 ── */}
      {step === "character" && (
        <PersonalityTest
          onComplete={handleCharacterComplete}
          availableJobs={availableJobs}
          characterNameHint={config.character_name_hint}
          initialSceneIdx={initialProgress?.sceneIdx}
          initialChoices={initialProgress?.choices}
          onSceneProgress={saveProgress}
        />
      )}

      {/* ── Step 2: 아바타 + 입장 ── */}
      {step === "avatar" && characterData && (
        <div className="space-y-5">
          <div className="rounded-xl border border-black/8 bg-neutral-50 px-4 py-3 text-xs dark:border-white/8 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">캐릭터</span>
              <span className="font-medium text-neutral-800 dark:text-neutral-200">{characterData.characterName}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-neutral-500">직업</span>
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                {config.job_labels[characterData.job] ?? characterData.job}
              </span>
            </div>
            {characterData.personality.summary && (
              <div className="mt-1 flex items-center justify-between">
                <span className="text-neutral-500">성향</span>
                <span className="font-medium text-neutral-800 dark:text-neutral-200">{characterData.personality.summary}</span>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">아바타 색상</p>
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
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setStep(savedChars.length > 0 ? "select" : "character")}
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
