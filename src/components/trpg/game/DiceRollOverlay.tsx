"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ActionOutcome } from "@/lib/trpg/types/game";

interface DiceRollOverlayProps {
  dc: number;
  modifier: number;        // 직업 보너스 (클라이언트에서 outcome 계산용)
  checkLabel: string;
  onClose: (rolled: number) => void;  // 계속하기 클릭 시 rolled 값 전달
  stateNote?: string;      // 판정 결과 아래 추가 상태 변화 설명 (선택)
}

type Phase = "idle" | "rolling" | "result";

const OUTCOME_CONFIG: Record<NonNullable<ActionOutcome>, { label: string; color: string; bg: string }> = {
  critical_success: { label: "크리티컬 성공!", color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30" },
  success:          { label: "성공!",          color: "text-green-400",  bg: "bg-green-400/10 border-green-400/30"  },
  partial:          { label: "부분 성공",       color: "text-blue-400",   bg: "bg-blue-400/10 border-blue-400/30"   },
  failure:          { label: "실패",            color: "text-red-400",    bg: "bg-red-400/10 border-red-400/30"     },
};

// 감속 스케줄 — 합계 정확히 2000ms
// 60×10=600 / 80×5=400 / 120×3=360 / 200×2=400 / 240×1=240
const DECEL_SCHEDULE = [
  60, 60, 60, 60, 60, 60, 60, 60, 60, 60,
  80, 80, 80, 80, 80,
  120, 120, 120,
  200, 200,
  240,
] as const;

function calcOutcome(rolled: number, total: number, dc: number): NonNullable<ActionOutcome> {
  if (rolled === 20)      return "critical_success";
  if (total >= dc + 5)   return "success";
  if (total >= dc)       return "partial";
  return "failure";
}

export default function DiceRollOverlay({
  dc,
  modifier,
  checkLabel,
  onClose,
  stateNote,
}: DiceRollOverlayProps) {
  const [phase, setPhase]               = useState<Phase>("idle");
  const [displayNumber, setDisplayNumber] = useState(1);
  const [countdown, setCountdown]       = useState(7);
  const [finalRolled, setFinalRolled]   = useState<number | null>(null);

  const timeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRolledRef  = useRef(false);

  const clearPending = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startRolling = useCallback(() => {
    if (hasRolledRef.current) return;
    hasRolledRef.current = true;

    // 클라이언트에서 즉시 d20 롤
    const rolled = Math.ceil(Math.random() * 20);
    setPhase("rolling");

    let idx = 0;

    const tick = () => {
      if (idx < DECEL_SCHEDULE.length) {
        setDisplayNumber(Math.ceil(Math.random() * 20));
        timeoutRef.current = setTimeout(tick, DECEL_SCHEDULE[idx++]);
      } else {
        // 2초 경과 → 결과 확정
        setDisplayNumber(rolled);
        setFinalRolled(rolled);
        setPhase("result");
      }
    };

    timeoutRef.current = setTimeout(tick, DECEL_SCHEDULE[idx++]);
  }, []);

  // 카운트다운 (idle)
  useEffect(() => {
    if (phase !== "idle") return;
    if (countdown <= 0) {
      startRolling();
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, countdown, startRolling]);

  // 언마운트 정리
  useEffect(() => () => clearPending(), [clearPending]);

  const outcome = finalRolled !== null
    ? calcOutcome(finalRolled, finalRolled + modifier, dc)
    : null;
  const outcomeConfig = outcome ? OUTCOME_CONFIG[outcome] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={phase === "idle" ? startRolling : undefined}
    >
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

        {/* DC */}
        <div className="flex items-center gap-2 rounded-full bg-neutral-200/60 px-4 py-1.5 dark:bg-neutral-800/60">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">목표 DC</span>
          <span className="text-lg font-bold text-neutral-900 dark:text-neutral-100">{dc}</span>
        </div>

        {/* D20 */}
        <div
          className={`relative flex h-36 w-36 cursor-pointer items-center justify-center ${
            phase === "idle" ? "animate-pulse" : ""
          } ${phase === "rolling" ? "animate-spin" : ""}`}
          style={{ animationDuration: phase === "rolling" ? "0.6s" : undefined }}
          onClick={phase === "idle" ? startRolling : undefined}
        >
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
            <polygon
              points="50,5 80,18 95,45 95,68 80,90 50,97 20,90 5,68 5,45 20,18"
              fill="none" stroke="currentColor" strokeWidth="2.5"
              className="text-neutral-400 dark:text-neutral-500"
            />
            <line x1="50" y1="5"  x2="50" y2="97" stroke="currentColor" strokeWidth="1" className="text-neutral-300 dark:text-neutral-600" />
            <line x1="5"  y1="45" x2="95" y2="68" stroke="currentColor" strokeWidth="1" className="text-neutral-300 dark:text-neutral-600" />
            <line x1="5"  y1="68" x2="95" y2="45" stroke="currentColor" strokeWidth="1" className="text-neutral-300 dark:text-neutral-600" />
          </svg>
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

        {/* 단계별 하단 */}
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

        {phase === "result" && outcomeConfig && finalRolled !== null && (
          <div className="flex w-full flex-col items-center gap-3">
            {/* 결과 배지 */}
            <div className={`rounded-lg border px-5 py-2 text-base font-bold ${outcomeConfig.color} ${outcomeConfig.bg}`}>
              {outcomeConfig.label}
            </div>

            {/* 추가 상태 변화 설명 영역 */}
            {stateNote && (
              <p className="w-full rounded-lg bg-neutral-100 px-4 py-2.5 text-center text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {stateNote}
              </p>
            )}

            {/* 계속하기 */}
            <button
              onClick={() => onClose(finalRolled)}
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
