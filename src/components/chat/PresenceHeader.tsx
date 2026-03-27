"use client";

import type { Mood } from "@/lib/chat/types";

interface Props {
  name: string;
  initial: string;
  mood: Mood;
  vibe: string;
  onBack: () => void;
  onMenu: () => void;
}

const MOOD_CONFIG: Record<Mood, { ring: string; bg: string; glow: string; gradient: string }> = {
  happy:     { ring: "#fbbf24", bg: "rgba(251,191,36,0.15)",  glow: "rgba(251,191,36,0.25)",  gradient: "rgba(251,191,36,0.10)" },
  neutral:   { ring: "#a78bfa", bg: "rgba(167,139,250,0.15)", glow: "rgba(167,139,250,0.25)", gradient: "rgba(167,139,250,0.10)" },
  sad:       { ring: "#60a5fa", bg: "rgba(96,165,250,0.12)",  glow: "rgba(96,165,250,0.20)",  gradient: "rgba(96,165,250,0.08)" },
  angry:     { ring: "#f87171", bg: "rgba(248,113,113,0.12)", glow: "rgba(248,113,113,0.20)", gradient: "rgba(248,113,113,0.08)" },
  surprised: { ring: "#34d399", bg: "rgba(52,211,153,0.12)",  glow: "rgba(52,211,153,0.20)",  gradient: "rgba(52,211,153,0.08)" },
};

export default function PresenceHeader({ name, initial, mood, vibe, onBack, onMenu }: Props) {
  const cfg = MOOD_CONFIG[mood];

  return (
    <div
      className="relative flex flex-col items-center gap-2.5 px-5 pb-6 pt-5 flex-shrink-0 transition-all duration-700"
      style={{
        background: `radial-gradient(ellipse at 50% 0%, ${cfg.gradient} 0%, transparent 70%)`,
      }}
    >
      {/* 뒤로가기 */}
      <button
        onClick={onBack}
        className="absolute left-4 top-4 text-lg text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        ←
      </button>

      {/* 메뉴 */}
      <button
        onClick={onMenu}
        className="absolute right-4 top-4 text-lg text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        ⋯
      </button>

      {/* 아바타 */}
      <div
        className="flex h-[72px] w-[72px] items-center justify-center rounded-full text-2xl font-bold transition-all duration-700"
        style={{
          background: cfg.bg,
          color: cfg.ring,
          boxShadow: `0 0 0 3px ${cfg.ring}, 0 0 24px ${cfg.glow}`,
        }}
      >
        {initial}
      </div>

      <div className="text-[15px] font-semibold text-white">{name}</div>
      <div className="text-xs text-neutral-500 transition-all duration-700">{vibe}</div>
    </div>
  );
}
