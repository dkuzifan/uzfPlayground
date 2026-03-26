"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import PlayerCard from "./PlayerCard";
import { useWaitingRoom } from "@/hooks/trpg/useWaitingRoom";
import type { AuthProfile } from "@/hooks/useAuthProfile";

interface WaitingRoomProps {
  sessionId: string;
  profile: AuthProfile;
}

export default function WaitingRoom({ sessionId, profile }: WaitingRoomProps) {
  const router = useRouter();
  const { players, hostPcId, myPcId, maxPlayers, roomName, loading } = useWaitingRoom(
    sessionId,
    profile.userId
  );
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const amIHost = myPcId !== null && myPcId === hostPcId;
  const emptySlots = Math.max(0, maxPlayers - players.length);
  const fillRatio = players.length / Math.max(maxPlayers, 1);

  async function handleStart() {
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch(`/api/trpg/sessions/${sessionId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile.userId }),
      });
      const data = await res.json();
      if (!res.ok) { setStartError(data.detail ?? data.error ?? "게임 시작에 실패했습니다."); return; }
      router.push(`/tales/trpg/game/${sessionId}`);
    } catch { setStartError("네트워크 오류가 발생했습니다."); }
    finally { setStarting(false); }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-neutral-500">
        대기실 불러오는 중…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* 헤더 */}
      <div className="mb-8">
        <button
          onClick={() => router.push("/tales/trpg/lobby")}
          className="mb-3 flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition"
        >
          ← 로비로
        </button>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{roomName}</h1>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
          대기 중 · 방장이 게임을 시작하면 자동으로 이동합니다
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_220px]">

        {/* 참여자 목록 */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              참여자
            </p>
            <span className="text-xs text-neutral-400">{players.length} / {maxPlayers}명</span>
          </div>

          {/* 인원 바 */}
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-black/8 dark:bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${fillRatio * 100}%`,
                background: fillRatio >= 1 ? "#4ade80" : "#fbbf24",
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            {players.map((player, i) => (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0, transition: { delay: i * 0.05 } }}
              >
                <PlayerCard player={player} />
              </motion.div>
            ))}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center gap-3 rounded-xl border border-dashed border-black/15 px-4 py-3 opacity-50 dark:border-white/10"
              >
                <div className="h-10 w-10 flex-shrink-0 rounded-full border border-dashed border-black/15 dark:border-white/20" />
                <p className="text-sm text-neutral-400 dark:text-neutral-500">대기 중…</p>
              </div>
            ))}
          </div>
        </div>

        {/* 사이드바 */}
        <div className="flex flex-col gap-3">
          {/* 방 정보 카드 */}
          <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
              방 정보
            </p>
            <div className="space-y-2 text-sm">
              {[
                { label: "방 이름", value: roomName },
                { label: "최대 인원", value: `${maxPlayers}명` },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
                  <span className="font-medium text-neutral-900 dark:text-white">{value}</span>
                </div>
              ))}
              <div className="flex justify-between">
                <span className="text-neutral-500 dark:text-neutral-400">상태</span>
                <span className="flex items-center gap-1 font-medium text-yellow-600 dark:text-yellow-400">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
                  대기 중
                </span>
              </div>
            </div>
          </div>

          {/* 게임 시작 (방장만) */}
          {amIHost && (
            <div className="flex flex-col gap-2">
              {startError && (
                <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                  {startError}
                </p>
              )}
              <button
                onClick={handleStart}
                disabled={starting}
                className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
              >
                {starting ? "시작 중…" : "🎲 게임 시작"}
              </button>
            </div>
          )}

          <button
            onClick={() => router.push("/tales/trpg/lobby")}
            className="w-full rounded-xl border border-black/10 py-2.5 text-sm text-neutral-600 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
          >
            방 나가기
          </button>
        </div>
      </div>
    </div>
  );
}
