"use client";

import { useState } from "react";
import type { PersonalityTestAnswers } from "@/lib/types/character";

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
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      {/* Progress */}
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-xs text-neutral-400">
          <span>{STEPS[step]}</span>
          <span>{step + 1} / {STEPS.length}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/10">
          <div
            className="h-1.5 rounded-full bg-white/50 transition-all"
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
          className="rounded-lg px-4 py-2 text-sm text-neutral-400 transition-colors hover:text-white disabled:opacity-0"
        >
          이전
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20"
          >
            다음
          </button>
        ) : (
          <button
            onClick={() => onComplete(answers)}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
          >
            완료
          </button>
        )}
      </div>
    </div>
  );
}
