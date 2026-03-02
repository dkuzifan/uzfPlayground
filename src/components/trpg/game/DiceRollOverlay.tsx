"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { DiceResolveResult } from "@/lib/types/game";

interface DiceRollOverlayProps {
  dc: number;
  checkLabel: string;
  onRoll: () => Promise<void>;
  diceResult: DiceResolveResult | null;
  onClose: () => void;
}

type Phase = "idle" | "rolling" | "result";

const OUTCOME_CONFIG = {
  critical_success: { label: "크리티컬 성공!", color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30" },
  success: { label: "성공!", color: "text-green-400", bg: "bg-green-400/10 border-green-400/30" },
  partial: { label: "부분 성공", color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/30" },
  failure: { label: "실패", color: "text-red-400", bg: "bg-red-400/10 border-red-400/30" },
} as const;

export default function DiceRollOverlay({
  dc,
  checkLabel,
  onRoll,
  diceResult,
  onClose,
}: DiceRollOverlayProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [displayNumber, setDisplayNumber] = useState(1);
  const [countdown, setCountdown] = useState(7);
  const cycleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slowdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRolledRef = useRef(false);

  const clearCycleInterval = useCallback(() => {
    if (cycleIntervalRef.current) {
      clearInterval(cycleIntervalRef.current);
      cycleIntervalRef.current = null;
    }
  }, []);

  const startRolling = useCallback(async () => {
    if (hasRolledRef.current) return;
    hasRolledRef.current = true;
    setPhase("rolling");

    // 빠른 숫자 사이클링
    cycleIntervalRef.current = setInterval(() => {
      setDisplayNumber(Math.ceil(Math.random() * 20));
    }, 80);

    await onRoll();
  }, [onRoll]);

  // 카운트다운 (idle 단계)
  useEffect(() => {
    if (phase !== "idle") return;
    if (countdown <= 0) {
      startRolling();
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, countdown, startRolling]);

  // diceResult 수신 → 감속 후 정착
  useEffect(() => {
    if (!diceResult || phase !== "rolling") return;

    clearCycleInterval();

    // 감속 단계: 간격을 점점 늘리며 최종값에 수렴
    const steps = [150, 250, 350, 500];
    let stepIndex = 0;

    const slowStep = () => {
      if (stepIndex < steps.length) {
        setDisplayNumber(Math.ceil(Math.random() * 20));
        slowdownRef.current = setTimeout(slowStep, steps[stepIndex++]);
      } else {
        // 최종값 정착
        setDisplayNumber(diceResult.rolled);
        setPhase("result");
      }
    };
    slowdownRef.current = setTimeout(slowStep, steps[stepIndex++]);

    return () => {
      if (slowdownRef.current) clearTimeout(slowdownRef.current);
    };
  }, [diceResult, phase, clearCycleInterval]);

  // 언마운트 시 인터벌 정리
  useEffect(() => {
    return () => {
      clearCycleInterval();
      if (slowdownRef.current) clearTimeout(slowdownRef.current);
    };
  }, [clearCycleInterval]);

  const outcomeConfig = diceResult?.outcome ? OUTCOME_CONFIG[diceResult.outcome] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={phase === "idle" ? startRolling : undefined}
    >
      {/* 카드 */}
      <div
        className="relative flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-neutral-700 bg-neutral-50/95 p-8 shadow-2xl dark:bg-neutral-900/95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 제목 */}
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            판정 발생
          </p>
          <h2 className="mt-1 text-xl font-bold text-neutral-900 dark:text-neutral-100">
            {checkLabel}
          </h2>
        </div>

        {/* DC 표시 */}
        <div className="flex items-center gap-2 rounded-full bg-neutral-200/60 px-4 py-1.5 dark:bg-neutral-800/60">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">목표 DC</span>
          <span className="text-lg font-bold text-neutral-900 dark:text-neutral-100">{dc}</span>
        </div>

        {/* D20 SVG */}
        <div
          className={`relative flex h-36 w-36 cursor-pointer items-center justify-center ${
            phase === "idle" ? "animate-pulse" : ""
          } ${phase === "rolling" ? "animate-spin" : ""}`}
          style={{ animationDuration: phase === "rolling" ? "0.6s" : undefined }}
          onClick={phase === "idle" ? startRolling : undefined}
        >
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
            {/* 외곽 20면체 실루엣 (단순화: 8각형) */}
            <polygon
              points="50,5 80,18 95,45 95,68 80,90 50,97 20,90 5,68 5,45 20,18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-neutral-400 dark:text-neutral-500"
            />
            {/* 내부 선 */}
            <line x1="50" y1="5" x2="50" y2="97" stroke="currentColor" strokeWidth="1" className="text-neutral-300 dark:text-neutral-600" />
            <line x1="5" y1="45" x2="95" y2="68" stroke="currentColor" strokeWidth="1" className="text-neutral-300 dark:text-neutral-600" />
            <line x1="5" y1="68" x2="95" y2="45" stroke="currentColor" strokeWidth="1" className="text-neutral-300 dark:text-neutral-600" />
          </svg>
          {/* 숫자 */}
          <span
            className={`relative z-10 select-none text-4xl font-black tabular-nums ${
              phase === "result" && outcomeConfig
                ? outcomeConfig.color
                : "text-neutral-900 dark:text-neutral-100"
            }`}
          >
            {displayNumber}
          </span>
        </div>

        {/* 단계별 하단 UI */}
        {phase === "idle" && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              클릭하여 굴리기
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-sm font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {countdown}
            </div>
          </div>
        )}

        {phase === "rolling" && (
          <p className="text-sm font-medium text-neutral-400 animate-pulse">
            판정 중...
          </p>
        )}

        {phase === "result" && diceResult && outcomeConfig && (
          <div className="flex w-full flex-col items-center gap-3">
            {/* 계산식 */}
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              <span className="font-bold text-neutral-800 dark:text-neutral-200">
                {diceResult.rolled}
              </span>
              {diceResult.modifier !== 0 && (
                <>
                  {" "}
                  <span className="text-neutral-400">+</span>{" "}
                  <span className="font-bold text-neutral-800 dark:text-neutral-200">
                    {diceResult.modifier}
                  </span>
                </>
              )}
              {" "}
              <span className="text-neutral-400">=</span>{" "}
              <span className="font-bold text-neutral-800 dark:text-neutral-200">
                {diceResult.total}
              </span>
              {" "}
              <span className="text-neutral-400">vs DC</span>{" "}
              <span className="font-bold text-neutral-800 dark:text-neutral-200">
                {diceResult.dc}
              </span>
            </p>

            {/* 결과 배지 */}
            <div
              className={`rounded-lg border px-5 py-2 text-base font-bold ${outcomeConfig.color} ${outcomeConfig.bg}`}
            >
              {outcomeConfig.label}
            </div>

            {/* 계속하기 버튼 */}
            <button
              onClick={onClose}
              className="mt-1 w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              계속하기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
