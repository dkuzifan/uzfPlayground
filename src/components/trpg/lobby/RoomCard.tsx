"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { LobbySession } from "@/lib/types/lobby";
import type { CharacterCreationConfig } from "@/lib/trpg/types/character";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import JoinRoomModal from "./JoinRoomModal";

interface RoomCardProps {
  session: LobbySession;
}

const THEME_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  fantasy: { label: "⚔️ 판타지",  color: "#c9a84c", bg: "rgba(201,168,76,0.12)" },
  mystery: { label: "🔍 미스터리", color: "#93c5fd", bg: "rgba(147,197,253,0.12)" },
  horror:  { label: "🩸 호러",    color: "#dc2626", bg: "rgba(220,38,38,0.12)" },
  "sci-fi":{ label: "🚀 SF",      color: "#22d3ee", bg: "rgba(34,211,238,0.12)" },
};

export default function RoomCard({ session }: RoomCardProps) {
  const router = useRouter();
  const { profile, saveProfile } = useAuthProfile();
  const isFull = session.player_count >= session.max_players;

  const [checking, setChecking] = useState(false);
  const [joinModal, setJoinModal] = useState<{
    scenarioTitle: string;
    config: CharacterCreationConfig;
  } | null>(null);

  const theme = (session as unknown as { theme?: string }).theme;
  const themeBadge = theme ? THEME_BADGE[theme] : null;
  const fillRatio = session.player_count / session.max_players;

  async function handleEnter() {
    if (isFull || !profile) return;
    setChecking(true);
    try {
      const res = await fetch(`/api/trpg/sessions/${session.id}/my-character`);
      const data = await res.json();
      if (res.status === 409) { alert(data.error ?? "이미 시작된 방입니다."); return; }
      if (!res.ok) { alert(data.error ?? "입장 확인에 실패했습니다."); return; }
      if (data.exists) {
        router.push(`/tales/trpg/lobby/${session.id}`);
      } else {
        setJoinModal({ scenarioTitle: data.scenario?.title ?? session.scenario_title, config: data.scenario?.character_creation_config });
      }
    } catch { alert("네트워크 오류가 발생했습니다."); }
    finally { setChecking(false); }
  }

  return (
    <>
      <motion.div
        whileHover={{ y: -3 }}
        className={`rounded-2xl border p-5 transition-shadow ${isFull ? "opacity-60" : "cursor-pointer"}`}
        style={{
          borderColor: "var(--color-border, rgba(0,0,0,0.08))",
          background: "var(--color-card, white)",
        }}
        onClick={!isFull ? handleEnter : undefined}
      >
        {/* 헤더: 제목 + 상태 */}
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <h3 className="font-semibold text-neutral-900 dark:text-white leading-snug">
            {session.room_name}
          </h3>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              isFull
                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                : "bg-green-500/10 text-green-700 dark:text-green-400"
            }`}
          >
            {isFull ? "만석" : "참여 가능"}
          </span>
        </div>

        {/* 시나리오 제목 */}
        <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400 leading-snug">
          {session.scenario_title}
        </p>

        {/* 테마 배지 */}
        {themeBadge && (
          <span
            className="mb-3 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium"
            style={{ color: themeBadge.color, background: themeBadge.bg }}
          >
            {themeBadge.label}
          </span>
        )}

        {/* 인원 바 */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-black/8 dark:bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${fillRatio * 100}%`,
                background: isFull ? "#f87171" : "#4ade80",
              }}
            />
          </div>
          <span className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">
            👥 {session.player_count}/{session.max_players}
          </span>
        </div>

        {/* 입장 버튼 (만석이면 비활성) */}
        {!isFull && (
          <button
            onClick={(e) => { e.stopPropagation(); handleEnter(); }}
            disabled={checking || !profile}
            className="mt-3 w-full rounded-xl bg-neutral-900 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            {checking ? "확인 중…" : "입장하기"}
          </button>
        )}
      </motion.div>

      {joinModal && profile && (
        <JoinRoomModal
          open={true}
          onClose={() => setJoinModal(null)}
          sessionId={session.id}
          scenarioTitle={joinModal.scenarioTitle}
          config={joinModal.config}
          onSaveProfile={saveProfile}
        />
      )}
    </>
  );
}
