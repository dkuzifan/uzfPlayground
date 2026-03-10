"use client";

import { useState } from "react";
import type { ScenarioSummary } from "./ScenarioSelectStep";

interface Props {
  onComplete: (scenario: ScenarioSummary) => void;
  onBack: () => void;
}

type SubStep = "basic" | "jobs" | "prompt";

interface JobConfig {
  job: string;
  label: string;
  enabled: boolean;
}

const THEME_OPTIONS = [
  { value: "fantasy", label: "판타지", icon: "⚔️" },
  { value: "mystery", label: "미스터리", icon: "🔍" },
  { value: "horror",  label: "호러",    icon: "👻" },
  { value: "sci-fi",  label: "SF",      icon: "🚀" },
];

const THEME_JOB_PRESETS: Record<string, JobConfig[]> = {
  fantasy: [
    { job: "warrior", label: "전사",     enabled: true },
    { job: "mage",    label: "마법사",   enabled: true },
    { job: "rogue",   label: "도적",     enabled: true },
    { job: "cleric",  label: "성직자",   enabled: true },
    { job: "ranger",  label: "레인저",   enabled: true },
    { job: "paladin", label: "성기사",   enabled: false },
    { job: "bard",    label: "음유시인", enabled: false },
  ],
  mystery: [
    { job: "detective",  label: "형사",   enabled: true },
    { job: "journalist", label: "기자",   enabled: true },
    { job: "doctor",     label: "의사",   enabled: true },
    { job: "lawyer",     label: "변호사", enabled: true },
    { job: "civilian",   label: "민간인", enabled: true },
  ],
  horror: [
    { job: "detective",  label: "형사",   enabled: true },
    { job: "doctor",     label: "의사",   enabled: true },
    { job: "journalist", label: "기자",   enabled: true },
    { job: "civilian",   label: "생존자", enabled: true },
  ],
  "sci-fi": [
    { job: "warrior", label: "전투원",   enabled: true },
    { job: "mage",    label: "과학자",   enabled: true },
    { job: "rogue",   label: "해커",     enabled: true },
    { job: "cleric",  label: "기술자",   enabled: true },
    { job: "ranger",  label: "탐사대원", enabled: true },
  ],
};

const JOB_EMOJI: Record<string, string> = {
  warrior: "⚔️", mage: "🔮", rogue: "🗡️", cleric: "✨",
  ranger: "🏹", paladin: "🛡️", bard: "🎵", adventurer: "🎒",
  detective: "🔍", journalist: "📰", doctor: "🩺", lawyer: "⚖️", civilian: "👤",
};

const PERSONALITY_THEME_MAP: Record<string, string> = {
  fantasy: "fantasy",
  mystery: "modern",
  horror:  "modern",
  "sci-fi": "modern",
};

export default function ScenarioCreateStep({ onComplete, onBack }: Props) {
  const [subStep, setSubStep] = useState<SubStep>("basic");

  // Step A
  const [title, setTitle]           = useState("");
  const [theme, setTheme]           = useState("fantasy");
  const [description, setDescription] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);

  // Step B
  const [jobs, setJobs] = useState<JobConfig[]>(THEME_JOB_PRESETS.fantasy);

  // Step C
  const [gmPrompt, setGmPrompt]       = useState("");
  const [generating, setGenerating]   = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);

  // ── Step A → B ──────────────────────────────────────────────────────
  function handleBasicNext() {
    const preset = THEME_JOB_PRESETS[theme] ?? THEME_JOB_PRESETS.fantasy;
    setJobs(preset.map((j) => ({ ...j })));
    setSubStep("jobs");
  }

  // ── Step B: 직업 토글/라벨 편집 ──────────────────────────────────────
  function toggleJob(idx: number) {
    setJobs((prev) =>
      prev.map((j, i) => (i === idx ? { ...j, enabled: !j.enabled } : j))
    );
  }

  function updateLabel(idx: number, label: string) {
    setJobs((prev) =>
      prev.map((j, i) => (i === idx ? { ...j, label } : j))
    );
  }

  const enabledJobs = jobs.filter((j) => j.enabled);

  // ── Step C: AI 초안 생성 ─────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const jobLabels = Object.fromEntries(
        enabledJobs.map((j) => [j.job, j.label])
      );
      const res = await fetch("/api/trpg/scenarios/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, theme, description, job_labels: jobLabels }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(data.error ?? "생성에 실패했습니다.");
      } else {
        setGmPrompt(data.gm_system_prompt);
      }
    } catch {
      setGenerateError("네트워크 오류가 발생했습니다.");
    } finally {
      setGenerating(false);
    }
  }

  // ── 최종 저장 ────────────────────────────────────────────────────────
  async function handleSave() {
    if (!gmPrompt.trim()) return;
    setSaving(true);
    setSaveError(null);

    const jobLabels = Object.fromEntries(
      enabledJobs.map((j) => [j.job, j.label])
    );

    try {
      const res = await fetch("/api/trpg/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          theme,
          description,
          max_players: maxPlayers,
          gm_system_prompt: gmPrompt,
          character_creation_config: {
            available_jobs: enabledJobs.map((j) => j.job),
            job_labels: jobLabels,
            personality_test_theme: PERSONALITY_THEME_MAP[theme] ?? "fantasy",
            character_name_hint:
              theme === "fantasy" ? "모험가의 이름을 입력하세요" : "캐릭터 이름을 입력하세요",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "저장에 실패했습니다.");
      } else {
        onComplete(data);
      }
    } catch {
      setSaveError("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  // ── 렌더 ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* 진행 표시 */}
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        {(["basic", "jobs", "prompt"] as SubStep[]).map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                subStep === s
                  ? "bg-yellow-400 text-neutral-900"
                  : i < ["basic", "jobs", "prompt"].indexOf(subStep)
                  ? "bg-neutral-300 text-neutral-600 dark:bg-neutral-600 dark:text-neutral-300"
                  : "border border-neutral-300 dark:border-neutral-600"
              }`}
            >
              {i + 1}
            </span>
            <span className={subStep === s ? "text-neutral-700 dark:text-neutral-200" : ""}>
              {["기본 정보", "직업 설정", "GM 프롬프트"][i]}
            </span>
            {i < 2 && <span>›</span>}
          </span>
        ))}
      </div>

      {/* ── Step A: 기본 정보 ── */}
      {subStep === "basic" && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              시나리오 제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              maxLength={40}
              placeholder="예: 어둠의 던전, 저택 살인사건"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-black/15 bg-white/70 px-3 py-2 text-sm outline-none focus:border-yellow-500/60 dark:border-white/20 dark:bg-white/5 dark:text-white"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              테마 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {THEME_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                    theme === t.value
                      ? "border-yellow-400 bg-yellow-50 font-semibold text-yellow-700 dark:border-yellow-500 dark:bg-yellow-900/20 dark:text-yellow-300"
                      : "border-black/10 bg-white hover:border-yellow-300 dark:border-white/10 dark:bg-white/5"
                  }`}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              시나리오 설명
            </label>
            <textarea
              rows={3}
              maxLength={300}
              placeholder="플레이어에게 보여줄 간단한 소개 (선택)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full resize-none rounded-lg border border-black/15 bg-white/70 px-3 py-2 text-sm outline-none focus:border-yellow-500/60 dark:border-white/20 dark:bg-white/5 dark:text-white"
            />
            <p className="mt-0.5 text-right text-xs text-neutral-400">
              {description.length}/300
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              최대 인원{" "}
              <span className="font-bold text-yellow-600 dark:text-yellow-400">{maxPlayers}명</span>
            </label>
            <input
              type="range" min={2} max={7} value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="w-full accent-yellow-500"
            />
            <div className="flex justify-between text-xs text-neutral-400">
              <span>2명</span><span>7명</span>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onBack}
              className="flex-1 rounded-lg border border-black/10 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              취소
            </button>
            <button
              onClick={handleBasicNext}
              disabled={!title.trim()}
              className="flex-1 rounded-lg bg-yellow-400 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-yellow-500 disabled:opacity-40"
            >
              다음 →
            </button>
          </div>
        </div>
      )}

      {/* ── Step B: 직업 설정 ── */}
      {subStep === "jobs" && (
        <div className="space-y-4">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            플레이어가 선택할 수 있는 직업을 설정하세요. 이름도 자유롭게 바꿀 수 있습니다.
          </p>

          <div className="space-y-2">
            {jobs.map((j, idx) => (
              <div
                key={j.job}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
                  j.enabled
                    ? "border-yellow-400/50 bg-yellow-50/60 dark:border-yellow-500/30 dark:bg-yellow-900/10"
                    : "border-black/10 bg-white opacity-50 dark:border-white/10 dark:bg-white/5"
                }`}
              >
                <button
                  onClick={() => toggleJob(idx)}
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border text-xs font-bold transition ${
                    j.enabled
                      ? "border-yellow-400 bg-yellow-400 text-neutral-900"
                      : "border-neutral-300 dark:border-neutral-600"
                  }`}
                >
                  {j.enabled && "✓"}
                </button>
                <span className="text-base">{JOB_EMOJI[j.job] ?? "👤"}</span>
                <input
                  type="text"
                  value={j.label}
                  onChange={(e) => updateLabel(idx, e.target.value)}
                  disabled={!j.enabled}
                  maxLength={12}
                  className="flex-1 bg-transparent text-sm font-medium outline-none dark:text-white"
                />
                <span className="text-xs text-neutral-400 dark:text-neutral-500">{j.job}</span>
              </div>
            ))}
          </div>

          {enabledJobs.length === 0 && (
            <p className="text-xs text-red-400">최소 1개 이상의 직업을 선택해주세요.</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setSubStep("basic")}
              className="flex-1 rounded-lg border border-black/10 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              ← 이전
            </button>
            <button
              onClick={() => setSubStep("prompt")}
              disabled={enabledJobs.length === 0}
              className="flex-1 rounded-lg bg-yellow-400 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-yellow-500 disabled:opacity-40"
            >
              다음 →
            </button>
          </div>
        </div>
      )}

      {/* ── Step C: GM 프롬프트 ── */}
      {subStep === "prompt" && (
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                GM 시스템 프롬프트 <span className="text-red-500">*</span>
              </label>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
              >
                {generating ? (
                  <>
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white dark:border-neutral-900/30 dark:border-t-neutral-900" />
                    생성 중…
                  </>
                ) : (
                  <>✨ AI로 초안 생성</>
                )}
              </button>
            </div>

            {generateError && (
              <p className="mb-1.5 text-xs text-red-400">{generateError}</p>
            )}

            <textarea
              rows={10}
              placeholder={`AI 초안 생성 버튼을 누르거나 직접 작성하세요.\n\n예시:\n당신은 어둠의 던전을 배경으로 한 판타지 RPG의 게임 마스터입니다.\n\n[세계관]\n...\n\n[GM 규칙]\n...`}
              value={gmPrompt}
              onChange={(e) => setGmPrompt(e.target.value)}
              className="w-full resize-none rounded-lg border border-black/15 bg-white/70 px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-yellow-500/60 dark:border-white/20 dark:bg-white/5 dark:text-white"
            />
            <p className="mt-0.5 text-right text-xs text-neutral-400">
              {gmPrompt.length}자
            </p>
          </div>

          {saveError && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500 dark:text-red-400">
              {saveError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setSubStep("jobs")}
              className="flex-1 rounded-lg border border-black/10 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              ← 이전
            </button>
            <button
              onClick={handleSave}
              disabled={!gmPrompt.trim() || saving}
              className="flex-1 rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              {saving ? "저장 중…" : "시나리오 저장"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
