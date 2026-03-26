"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ActionOutcome } from "@/lib/trpg/types/game";

interface DiceRollOverlayProps {
  dc: number;
  modifier: number;
  checkLabel: string;
  onClose: (rolled: number) => void;
  stateNote?: string;
}

type Phase = "idle" | "rolling" | "result";

// 감속 스케줄 — 합계 약 2000ms
const DECEL_SCHEDULE = [
  60, 60, 60, 60, 60, 60, 60, 60, 60, 60,
  80, 80, 80, 80, 80,
  120, 120, 120,
  200, 200,
  240,
] as const;

function calcOutcome(rolled: number, total: number, dc: number): NonNullable<ActionOutcome> {
  if (rolled === 20 || total >= dc + 5) return "great_success";
  if (total >= dc) return "success";
  return "failure";
}

const OUTCOME_CFG = {
  great_success: {
    label: "대성공!",
    numColor: "#fbbf24",
    glow: "0 0 40px rgba(251,191,36,0.6), 0 0 80px rgba(251,191,36,0.3)",
    bg: "rgba(251,191,36,0.12)",
    border: "rgba(251,191,36,0.4)",
    particle: true,
  },
  success: {
    label: "성공!",
    numColor: "#4ade80",
    glow: "0 0 20px rgba(74,222,128,0.4)",
    bg: "rgba(74,222,128,0.1)",
    border: "rgba(74,222,128,0.35)",
    particle: false,
  },
  failure: {
    label: "실패",
    numColor: "#f87171",
    glow: "none",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.35)",
    particle: false,
  },
};

export default function DiceRollOverlay({
  dc,
  modifier,
  checkLabel,
  onClose,
  stateNote,
}: DiceRollOverlayProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [displayNumber, setDisplayNumber] = useState(1);
  const [countdown, setCountdown] = useState(7);
  const [finalRolled, setFinalRolled] = useState<number | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRolledRef = useRef(false);

  const clearPending = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }, []);

  const startRolling = useCallback(() => {
    if (hasRolledRef.current) return;
    hasRolledRef.current = true;

    const rolled = Math.ceil(Math.random() * 20);
    setPhase("rolling");
    let idx = 0;

    const tick = () => {
      if (idx < DECEL_SCHEDULE.length) {
        setDisplayNumber(Math.ceil(Math.random() * 20));
        timeoutRef.current = setTimeout(tick, DECEL_SCHEDULE[idx++]);
      } else {
        setDisplayNumber(rolled);
        setFinalRolled(rolled);
        setPhase("result");
      }
    };
    timeoutRef.current = setTimeout(tick, DECEL_SCHEDULE[idx++]);
  }, []);

  // 카운트다운
  useEffect(() => {
    if (phase !== "idle") return;
    if (countdown <= 0) { startRolling(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown, startRolling]);

  useEffect(() => () => clearPending(), [clearPending]);

  const outcome = finalRolled !== null
    ? calcOutcome(finalRolled, finalRolled + modifier, dc)
    : null;
  const cfg = outcome ? OUTCOME_CFG[outcome] : null;
  const total = finalRolled !== null ? finalRolled + modifier : null;

  return (
    // 1단계: 배경 어두워지며 포커스
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ backgroundColor: "rgba(0,0,0,0)" }}
      animate={{ backgroundColor: "rgba(0,0,0,0.88)" }}
      transition={{ duration: 0.4 }}
      onClick={phase === "idle" ? startRolling : undefined}
    >
      <div
        className="relative flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl p-8"
        style={{
          background: "var(--skin-bg-card)",
          border: "1px solid var(--skin-border)",
          boxShadow: phase === "result" && cfg ? cfg.glow : "0 0 60px rgba(0,0,0,0.6)",
          transition: "box-shadow 0.5s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="text-center">
          <p
            className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--skin-text-muted)", fontFamily: "var(--skin-font-display)" }}
          >
            판정 발생
          </p>
          <h2
            className="mt-1 text-xl font-bold"
            style={{ color: "var(--skin-text)", fontFamily: "var(--skin-font-display)" }}
          >
            {checkLabel}
          </h2>
        </div>

        {/* DC 배지 */}
        <div
          className="flex items-center gap-2 rounded-full px-4 py-1.5"
          style={{ background: "var(--skin-bg-secondary)", border: "1px solid var(--skin-border)" }}
        >
          <span className="text-sm" style={{ color: "var(--skin-text-muted)" }}>목표 DC</span>
          <span className="text-lg font-bold" style={{ color: "var(--skin-text)", fontFamily: "var(--skin-font-display)" }}>
            {dc}
          </span>
          {modifier !== 0 && (
            <span className="text-sm" style={{ color: "var(--skin-accent)" }}>
              (+{modifier})
            </span>
          )}
        </div>

        {/* 2단계: 주사위 — 굴리는 중 회전 */}
        <div
          className={`relative flex h-36 w-36 cursor-pointer items-center justify-center ${
            phase === "idle" ? "animate-pulse" : ""
          }`}
          style={{
            animation: phase === "rolling" ? "dice-spin 0.5s linear infinite" : undefined,
          }}
          onClick={phase === "idle" ? startRolling : undefined}
        >
          <style>{`
            @keyframes dice-spin {
              0% { transform: rotate(0deg) scale(1); }
              50% { transform: rotate(180deg) scale(1.08); }
              100% { transform: rotate(360deg) scale(1); }
            }
            @keyframes dice-shake {
              0%, 100% { transform: translateX(0); }
              20%, 60% { transform: translateX(-6px); }
              40%, 80% { transform: translateX(6px); }
            }
          `}</style>

          {/* D20 SVG */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
            <polygon
              points="50,5 80,18 95,45 95,68 80,90 50,97 20,90 5,68 5,45 20,18"
              fill="none"
              stroke={cfg ? cfg.numColor : "var(--skin-accent)"}
              strokeWidth="2.5"
              style={{ opacity: phase === "result" ? 1 : 0.4, transition: "stroke 0.3s, opacity 0.3s" }}
            />
            <line x1="50" y1="5"  x2="50" y2="97" stroke="var(--skin-border)" strokeWidth="1" />
            <line x1="5"  y1="45" x2="95" y2="68" stroke="var(--skin-border)" strokeWidth="1" />
            <line x1="5"  y1="68" x2="95" y2="45" stroke="var(--skin-border)" strokeWidth="1" />
          </svg>

          {/* 숫자 */}
          <span
            className="relative z-10 select-none text-4xl font-black tabular-nums transition-all"
            style={{
              color: phase === "result" && cfg ? cfg.numColor : "var(--skin-text)",
              textShadow: phase === "result" && cfg ? cfg.glow : "none",
              fontFamily: "var(--skin-font-display)",
              animation: outcome === "failure" && phase === "result" ? "dice-shake 0.5s ease" : undefined,
            }}
          >
            {displayNumber}
          </span>
        </div>

        {/* 3단계: 결과 reveal */}
        <AnimatePresence mode="wait">
          {phase === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-2"
            >
              <p className="text-sm" style={{ color: "var(--skin-text-muted)" }}>클릭하여 굴리기</p>
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold"
                style={{ background: "var(--skin-bg-secondary)", color: "var(--skin-text)", border: "1px solid var(--skin-border)" }}
              >
                {countdown}
              </div>
            </motion.div>
          )}

          {phase === "rolling" && (
            <motion.p
              key="rolling"
              initial={{ opacity: 0 }}
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="text-sm"
              style={{ color: "var(--skin-text-muted)" }}
            >
              판정 중...
            </motion.p>
          )}

          {phase === "result" && cfg && finalRolled !== null && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
              className="flex w-full flex-col items-center gap-3"
            >
              {/* 결과 배지 */}
              <div
                className="rounded-xl px-6 py-2 text-lg font-bold"
                style={{ color: cfg.numColor, background: cfg.bg, border: `1px solid ${cfg.border}` }}
              >
                {cfg.label}
              </div>

              {/* 총합 표시 */}
              <p className="text-xs" style={{ color: "var(--skin-text-muted)" }}>
                d20({finalRolled}) + {modifier} = <strong style={{ color: "var(--skin-text)" }}>{total}</strong>
                {" "}vs DC {dc}
              </p>

              {stateNote && (
                <p
                  className="w-full rounded-lg px-4 py-2.5 text-center text-sm"
                  style={{ background: "var(--skin-bg-secondary)", color: "var(--skin-text-muted)", border: "1px solid var(--skin-border)" }}
                >
                  {stateNote}
                </p>
              )}

              <button
                onClick={() => onClose(finalRolled)}
                className="mt-1 w-full rounded-lg py-2.5 text-sm font-semibold transition"
                style={{
                  background: "var(--skin-accent)",
                  color: "var(--skin-bg)",
                }}
              >
                계속하기
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
