"use client";

import { useState, useEffect } from "react";
import type { CharacterCreationConfig } from "@/lib/trpg/types/character";

export interface ScenarioSummary {
  id: string;
  title: string;
  theme: string;
  description: string | null;
  max_players: number;
  character_creation_config: CharacterCreationConfig;
}

interface Props {
  onSelect: (scenario: ScenarioSummary) => void;
  onCreateNew: () => void;
  onCopyScenario?: (scenarioId: string) => void;
}

const THEME_LABEL: Record<string, string> = {
  fantasy: "판타지",
  mystery: "미스터리",
  horror: "호러",
  "sci-fi": "SF",
};

const THEME_COLOR: Record<string, string> = {
  fantasy:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  mystery:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  horror:
    "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "sci-fi":
    "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
};

const THEME_ICON: Record<string, string> = {
  fantasy: "⚔️",
  mystery: "🔍",
  horror: "👻",
  "sci-fi": "🚀",
};

export default function ScenarioSelectStep({ onSelect, onCreateNew, onCopyScenario }: Props) {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/trpg/scenarios")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setScenarios(data);
        else setError("시나리오를 불러오지 못했습니다.");
      })
      .catch(() => setError("네트워크 오류가 발생했습니다."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-neutral-400">
        시나리오 불러오는 중…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        플레이할 시나리오를 선택하세요
      </p>

      <div className="grid grid-cols-1 gap-3">
        {/* 기존 시나리오 목록 */}
        {scenarios.map((scenario) => {
          const themeKey = scenario.theme in THEME_LABEL ? scenario.theme : "fantasy";
          return (
            <div key={scenario.id} className="group relative">
              <button
                onClick={() => onSelect(scenario)}
                className="w-full rounded-xl border border-black/10 bg-white p-4 text-left transition hover:border-yellow-400/60 hover:bg-yellow-50/50 dark:border-white/10 dark:bg-white/5 dark:hover:border-yellow-500/40 dark:hover:bg-yellow-900/10"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-lg">{THEME_ICON[themeKey]}</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {scenario.title}
                  </span>
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${THEME_COLOR[themeKey] ?? THEME_COLOR.fantasy}`}
                  >
                    {THEME_LABEL[themeKey] ?? scenario.theme}
                  </span>
                </div>

                {scenario.description && (
                  <p className="mb-2 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
                    {scenario.description}
                  </p>
                )}

                <div className="flex items-center gap-3 text-xs text-neutral-400 dark:text-neutral-500">
                  <span>최대 {scenario.max_players}명</span>
                  <span>·</span>
                  <span>
                    {scenario.character_creation_config.available_jobs.length}가지 직업
                  </span>
                </div>
              </button>

              {onCopyScenario && (
                <button
                  onClick={(e) => { e.stopPropagation(); onCopyScenario(scenario.id); }}
                  className="absolute right-3 top-3 rounded-lg border border-black/10 bg-white px-2 py-1 text-[10px] font-medium text-neutral-500 opacity-0 transition hover:border-indigo-400/60 hover:bg-indigo-50 hover:text-indigo-600 group-hover:opacity-100 dark:border-white/10 dark:bg-neutral-800 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400"
                >
                  복사해서 편집
                </button>
              )}
            </div>
          );
        })}

        {/* 새 시나리오 만들기 */}
        <button
          onClick={onCreateNew}
          className="group w-full rounded-xl border border-dashed border-black/20 p-4 text-left transition hover:border-yellow-400/60 hover:bg-yellow-50/50 dark:border-white/20 dark:hover:border-yellow-500/40 dark:hover:bg-yellow-900/10"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-lg text-neutral-500 transition group-hover:bg-yellow-100 group-hover:text-yellow-600 dark:bg-white/10 dark:group-hover:bg-yellow-900/30 dark:group-hover:text-yellow-400">
              +
            </span>
            <div>
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                새 시나리오 만들기
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                AI가 세계관과 GM 프롬프트 초안을 생성해줍니다
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
