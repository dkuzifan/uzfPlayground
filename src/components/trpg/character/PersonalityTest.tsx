"use client";

import { useState } from "react";
import type { PersonalityTestAnswers } from "@/lib/trpg/types/character";

interface PersonalityTestProps {
  onComplete: (answers: PersonalityTestAnswers) => void;
}

const STEPS = ["MBTI", "에니어그램", "D&D 성향"] as const;

export default function PersonalityTest({ onComplete }: PersonalityTestProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<PersonalityTestAnswers>({
    mbti_answers: {},
    enneagram_answers: {},
    dnd_answers: {},
  });

  const progress = Math.round((step / STEPS.length) * 100);

  return (
    <div className="rounded-xl border border-black/10 bg-black/[0.04] p-6 dark:border-white/10 dark:bg-white/5">
      {/* Progress */}
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span>{STEPS[step]}</span>
          <span>{step + 1} / {STEPS.length}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10">
          <div
            className="h-1.5 rounded-full bg-neutral-400 transition-all dark:bg-white/50"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* TODO: 각 단계별 질문 렌더링 */}
      <div className="py-8 text-center text-neutral-500">
        {STEPS[step]} 테스트 질문 (구현 예정)
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-lg px-4 py-2 text-sm text-neutral-500 transition-colors hover:text-neutral-900 disabled:opacity-0 dark:text-neutral-400 dark:hover:text-white"
        >
          이전
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            className="rounded-lg bg-black/8 px-4 py-2 text-sm text-neutral-900 transition-colors hover:bg-black/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          >
            다음
          </button>
        ) : (
          <button
            onClick={() => onComplete(answers)}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
          >
            완료
          </button>
        )}
      </div>
    </div>
  );
}
