"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import ScenarioSelectStep, { type ScenarioSummary } from "./ScenarioSelectStep";
import ScenarioCreateStep, { type ScenarioInitialData } from "./ScenarioCreateStep";
import PersonalityTest from "@/components/trpg/onboarding/PersonalityTest";
import type { GuestProfile } from "@/lib/types/lobby";
import type { PersonalityProfile, CharacterJob, CharacterCreationConfig } from "@/lib/trpg/types/character";
import { AVATAR_COLORS } from "@/lib/types/lobby";

const DRAFT_KEY = "trpg_onboarding_draft";

interface OnboardingDraft {
  scenario: ScenarioSummary;
  sceneIdx: number;
  choices: number[];
}

interface CreateRoomModalProps {
  open: boolean;
  onClose: () => void;
  profile: GuestProfile;
  onSaveProfile: (nickname: string, avatarIndex: number) => void;
  resumeDraft?: boolean;
}

type Step = "scenario" | "create-scenario" | "character" | "room";

interface CharacterData {
  personality: PersonalityProfile;
  characterName: string;
  job: CharacterJob;
}

function buildAvailableJobs(config: CharacterCreationConfig) {
  return config.available_jobs.map((job) => ({
    value: job,
    label: config.job_labels[job] ?? job,
    desc: undefined,
    icon: JOB_EMOJI[job],
  }));
}

const JOB_EMOJI: Record<string, string> = {
  warrior: "⚔️", mage: "🔮", rogue: "🗡️", cleric: "✨",
  ranger: "🏹", paladin: "🛡️", bard: "🎶", adventurer: "🎒",
  detective: "🔍", journalist: "📰", doctor: "🩺", lawyer: "⚖️", civilian: "👤",
};

export default function CreateRoomModal({ open, onClose, profile, onSaveProfile, resumeDraft }: CreateRoomModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("scenario");
  const [selectedScenario, setSelectedScenario] = useState<ScenarioSummary | null>(null);
  const [characterData, setCharacterData] = useState<CharacterData | null>(null);
  const [draftSceneIdx, setDraftSceneIdx] = useState<number | undefined>(undefined);
  const [draftChoices, setDraftChoices] = useState<number[] | undefined>(undefined);

  // 복사 기능
  const [copyInitialData, setCopyInitialData] = useState<ScenarioInitialData | undefined>(undefined);
  const [copyLoading, setCopyLoading] = useState(false);

  // room step state
  const [roomName, setRoomName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [avatarIndex, setAvatarIndex] = useState(profile.avatarIndex ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 드래프트 복원: resumeDraft=true이고 모달이 열릴 때 sessionStorage 확인
  useEffect(() => {
    if (!open || !resumeDraft) return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft: OnboardingDraft = JSON.parse(raw);
      setSelectedScenario(draft.scenario);
      setMaxPlayers(draft.scenario.max_players);
      setDraftSceneIdx(draft.sceneIdx);
      setDraftChoices(draft.choices);
      setStep("character");
    } catch {
      sessionStorage.removeItem(DRAFT_KEY);
    }
  }, [open, resumeDraft]);

  function handleClose() {
    sessionStorage.removeItem(DRAFT_KEY);
    setStep("scenario");
    setSelectedScenario(null);
    setCharacterData(null);
    setDraftSceneIdx(undefined);
    setDraftChoices(undefined);
    setCopyInitialData(undefined);
    setRoomName("");
    setError(null);
    onClose();
  }

  function handleSceneProgress(sceneIdx: number, choices: number[]) {
    if (!selectedScenario) return;
    const draft: OnboardingDraft = { scenario: selectedScenario, sceneIdx, choices };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }

  // ── 시나리오 복사해서 편집 ─────────────────────────────────────────
  async function handleCopyScenario(scenarioId: string) {
    setCopyLoading(true);
    try {
      const res = await fetch(`/api/trpg/scenarios/${scenarioId}`);
      if (!res.ok) return;
      const data = await res.json() as ScenarioInitialData;
      setCopyInitialData(data);
      setStep("create-scenario");
    } catch {
      // 실패 시 빈 폼으로 새 시나리오 만들기
      setCopyInitialData(undefined);
      setStep("create-scenario");
    } finally {
      setCopyLoading(false);
    }
  }

  // ── Step 1: 시나리오 선택 완료 ─────────────────────────────────────
  function handleScenarioSelect(scenario: ScenarioSummary) {
    setSelectedScenario(scenario);
    setMaxPlayers(scenario.max_players);
    setDraftSceneIdx(undefined);
    setDraftChoices(undefined);
    // 새 시나리오 선택 시 기존 드래프트 초기화 후 새 드래프트 시작
    const draft: OnboardingDraft = { scenario, sceneIdx: 0, choices: [] };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    setStep("character");
  }

  // ── Step 1-sub: 새 시나리오 제작 완료 ──────────────────────────────
  function handleScenarioCreated(scenario: ScenarioSummary) {
    setSelectedScenario(scenario);
    setMaxPlayers(scenario.max_players);
    setDraftSceneIdx(undefined);
    setDraftChoices(undefined);
    const draft: OnboardingDraft = { scenario, sceneIdx: 0, choices: [] };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    setStep("character");
  }

  // ── Step 2: 캐릭터 생성 완료 ──────────────────────────────────────
  function handleCharacterComplete(personality: PersonalityProfile, characterName: string, job: CharacterJob) {
    setCharacterData({ personality, characterName, job });
    setStep("room");
  }

  // ── Step 3: 방 생성 제출 ──────────────────────────────────────────
  async function handleCreate() {
    if (!selectedScenario || !characterData || !roomName.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/trpg/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_name: roomName.trim(),
          max_players: maxPlayers,
          scenario_id: selectedScenario.id,
          localId: profile.localId,
          nickname: characterData.characterName,
          avatarIndex,
          characterName: characterData.characterName,
          job: characterData.job,
          personality: characterData.personality,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "방 생성에 실패했습니다.");
        return;
      }
      sessionStorage.removeItem(DRAFT_KEY);
      onSaveProfile(characterData.characterName, avatarIndex);
      router.push(`/trpg/lobby/${data.sessionId}`);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const roomNameError = roomName.trim().length === 0 && roomName.length > 0
    ? "방 이름을 입력해주세요."
    : roomName.length > 20 ? "방 이름은 최대 20자입니다." : null;

  const canSubmit = roomName.trim().length > 0 && roomName.length <= 20 && !loading;

  // ── 모달 타이틀 ────────────────────────────────────────────────────
  const titles: Record<Step, string> = {
    "scenario":        "시나리오 선택",
    "create-scenario": "새 시나리오 만들기",
    "character":       "캐릭터 생성",
    "room":            "방 설정",
  };

  // ── 단계 인디케이터 (시나리오 생성 중엔 숨김) ─────────────────────
  const showStepIndicator = step !== "create-scenario";
  const stepOrder: Step[] = ["scenario", "character", "room"];
  const stepLabels = ["시나리오", "캐릭터", "방 설정"];
  const currentStepIdx = stepOrder.indexOf(step === "create-scenario" ? "scenario" : step);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={titles[step]}
      size={step === "character" ? "lg" : "md"}
    >
      {/* 단계 인디케이터 */}
      {showStepIndicator && (
        <div className="mb-5 flex items-center gap-2 text-xs text-neutral-400">
          {stepOrder.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                i === currentStepIdx
                  ? "bg-yellow-400 text-neutral-900"
                  : i < currentStepIdx
                  ? "bg-neutral-300 text-neutral-600 dark:bg-neutral-600 dark:text-neutral-300"
                  : "border border-neutral-300 dark:border-neutral-600"
              }`}>
                {i + 1}
              </span>
              <span className={i === currentStepIdx ? "text-neutral-700 dark:text-neutral-200" : ""}>
                {stepLabels[i]}
              </span>
              {i < 2 && <span>›</span>}
            </span>
          ))}
        </div>
      )}

      {/* ── Step 1: 시나리오 선택 ── */}
      {step === "scenario" && (
        <>
          <ScenarioSelectStep
            onSelect={handleScenarioSelect}
            onCreateNew={() => { setCopyInitialData(undefined); setStep("create-scenario"); }}
            onCopyScenario={handleCopyScenario}
          />
          {copyLoading && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-neutral-400">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" />
              시나리오 불러오는 중…
            </div>
          )}
        </>
      )}

      {/* ── Step 1-sub: 새 시나리오 만들기 ── */}
      {step === "create-scenario" && (
        <ScenarioCreateStep
          onComplete={handleScenarioCreated}
          onBack={() => { setCopyInitialData(undefined); setStep("scenario"); }}
          initialData={copyInitialData}
        />
      )}

      {/* ── Step 2: 캐릭터 생성 ── */}
      {step === "character" && selectedScenario && (
        <PersonalityTest
          onComplete={handleCharacterComplete}
          availableJobs={buildAvailableJobs(selectedScenario.character_creation_config)}
          characterNameHint={selectedScenario.character_creation_config.character_name_hint}
          initialSceneIdx={draftSceneIdx}
          initialChoices={draftChoices}
          onSceneProgress={handleSceneProgress}
        />
      )}

      {/* ── Step 3: 방 설정 ── */}
      {step === "room" && (
        <div className="space-y-5">
          {/* 선택 요약 */}
          {selectedScenario && characterData && (
            <div className="rounded-xl border border-black/8 bg-neutral-50 px-4 py-3 text-xs dark:border-white/8 dark:bg-white/5">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500 dark:text-neutral-400">시나리오</span>
                <span className="font-medium text-neutral-800 dark:text-neutral-200">{selectedScenario.title}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-neutral-500 dark:text-neutral-400">캐릭터</span>
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {characterData.characterName} · {selectedScenario.character_creation_config.job_labels[characterData.job] ?? characterData.job}
                </span>
              </div>
            </div>
          )}

          {/* 아바타 선택 */}
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

          {/* 방 이름 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              방 이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              maxLength={21}
              placeholder="예: 어둠의 던전 탐험"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-black/15 bg-white/70 px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 outline-none focus:border-yellow-500/60 dark:border-white/20 dark:bg-white/5 dark:text-white dark:placeholder-neutral-500"
            />
            {roomNameError
              ? <p className="mt-1 text-xs text-red-500">{roomNameError}</p>
              : <p className="mt-1 text-xs text-neutral-500">최대 20자</p>
            }
          </div>

          {/* 최대 인원 */}
          <div>
            <label className="mb-2 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              최대 인원{" "}
              <span className="font-bold text-yellow-600 dark:text-yellow-400">{maxPlayers}명</span>
            </label>
            <input
              type="range" min={2} max={selectedScenario?.max_players ?? 7}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="w-full accent-yellow-500 dark:accent-yellow-400"
            />
            <div className="mt-1 flex justify-between text-xs text-neutral-500">
              <span>2명</span>
              <span>{selectedScenario?.max_players ?? 7}명</span>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setStep("character")} disabled={loading}>
              ← 이전
            </Button>
            <Button variant="primary" className="flex-1" disabled={!canSubmit} onClick={handleCreate}>
              {loading ? "생성 중…" : "만들기"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
