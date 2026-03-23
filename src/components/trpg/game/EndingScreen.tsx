"use client";

import { useEffect, useState } from "react";
import type { ScenarioEndings, EndingTone } from "@/lib/trpg/types/game";

interface Props {
  endingId: string;
  endings?: ScenarioEndings | null;
  finalNarration?: string;
  onLeave: () => void;
}

const TONE_STYLES: Record<EndingTone, { bg: string; text: string; badge: string }> = {
  triumphant: {
    bg: "from-yellow-900/80 via-amber-900/90 to-neutral-950",
    text: "text-yellow-300",
    badge: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40",
  },
  bittersweet: {
    bg: "from-slate-800/80 via-slate-900/90 to-neutral-950",
    text: "text-slate-200",
    badge: "bg-slate-500/20 text-slate-300 border border-slate-500/40",
  },
  tragic: {
    bg: "from-red-950/80 via-neutral-900/90 to-neutral-950",
    text: "text-red-300",
    badge: "bg-red-900/30 text-red-400 border border-red-800/40",
  },
  mysterious: {
    bg: "from-indigo-950/80 via-purple-950/90 to-neutral-950",
    text: "text-indigo-300",
    badge: "bg-indigo-900/30 text-indigo-300 border border-indigo-700/40",
  },
};

export default function EndingScreen({ endingId, endings, finalNarration, onLeave }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const ending = endings?.endings.find((e) => e.id === endingId);
  const tone: EndingTone = ending?.tone ?? "bittersweet";
  const styles = TONE_STYLES[tone];

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b ${styles.bg} transition-opacity duration-1000 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <div className="mx-auto max-w-xl px-6 text-center">
        {/* 엔딩 배지 */}
        {ending && (
          <div className={`mb-4 inline-block rounded-full px-4 py-1 text-xs font-semibold tracking-widest uppercase ${styles.badge}`}>
            {ending.label}
          </div>
        )}

        {/* 제목 */}
        <h1 className={`mb-6 text-4xl font-bold tracking-tight ${styles.text}`}>
          {ending ? ending.label : "게임 종료"}
        </h1>

        {/* 엔딩 설명 */}
        {ending?.description && (
          <p className="mb-6 text-sm leading-relaxed text-neutral-300">
            {ending.description}
          </p>
        )}

        {/* GM 최종 나레이션 */}
        {finalNarration && (
          <div className="mb-8 rounded-xl border border-white/10 bg-white/5 p-5 text-left">
            <p className="text-sm leading-relaxed text-neutral-200 italic">
              &ldquo;{finalNarration}&rdquo;
            </p>
          </div>
        )}

        {/* 로비 버튼 */}
        <button
          onClick={onLeave}
          className="rounded-lg bg-white/10 px-8 py-3 text-sm font-medium text-white transition hover:bg-white/20 active:scale-95"
        >
          로비로 돌아가기
        </button>
      </div>
    </div>
  );
}
