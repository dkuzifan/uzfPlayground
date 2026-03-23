"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PlayerCard from "./PlayerCard";
import Button from "@/components/ui/Button";
import { useWaitingRoom } from "@/hooks/trpg/useWaitingRoom";
import type { GuestProfile } from "@/lib/types/lobby";

interface WaitingRoomProps {
  sessionId: string;
  profile: GuestProfile;
}

export default function WaitingRoom({ sessionId, profile }: WaitingRoomProps) {
  const router = useRouter();
  const { players, hostPcId, myPcId, maxPlayers, roomName, loading } = useWaitingRoom(
    sessionId,
    profile.localId
  );
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const amIHost = myPcId !== null && myPcId === hostPcId;

  const emptySlots = Math.max(0, maxPlayers - players.length);

  async function handleStart() {
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch(`/api/trpg/sessions/${sessionId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localId: profile.localId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStartError(data.detail ?? data.error ?? "게임 시작에 실패했습니다.");
        return;
      }
      // 방장은 직접 이동 (다른 플레이어는 realtime으로 이동)
      router.push(`/trpg/game/${sessionId}`);
    } catch {
      setStartError("네트워크 오류가 발생했습니다.");
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-neutral-500">
        대기실 불러오는 중…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* 헤더 */}
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-3">
          <button
            onClick={() => router.push("/trpg/lobby")}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            ← 로비로
          </button>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{roomName}</h1>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
          대기 중 · 방장이 게임을 시작하면 자동으로 이동합니다
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_240px]">
        {/* 참여자 목록 */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500">
            참여자 ({players.length} / {maxPlayers}명)
          </p>
          <div className="flex flex-col gap-2">
            {players.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-300 px-4 py-3 opacity-60 dark:border-white/10"
              >
                <div className="h-10 w-10 flex-shrink-0 rounded-full border border-dashed border-neutral-300 dark:border-white/20" />
                <p className="text-sm text-neutral-400">대기 중…</p>
              </div>
            ))}
          </div>
        </div>

        {/* 사이드바 */}
        <div className="rounded-xl border border-black/10 bg-black/[0.04] p-5 dark:border-white/10 dark:bg-white/5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-500">
            방 정보
          </p>
          <div className="mb-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500 dark:text-neutral-400">방 이름</span>
              <span className="font-medium text-neutral-900 dark:text-white">{roomName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500 dark:text-neutral-400">최대 인원</span>
              <span className="font-medium text-neutral-900 dark:text-white">{maxPlayers}명</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500 dark:text-neutral-400">시나리오</span>
              <span className="font-medium text-neutral-900 dark:text-white">판타지 (기본)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500 dark:text-neutral-400">상태</span>
              <span className="flex items-center gap-1 font-medium text-yellow-600 dark:text-yellow-400">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
                대기 중
              </span>
            </div>
          </div>

          {amIHost && (
            <>
              {startError && (
                <p className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{startError}</p>
              )}
              <Button
                variant="primary"
                size="lg"
                className="mb-2 w-full"
                disabled={starting}
                onClick={handleStart}
              >
                {starting ? "시작 중…" : "게임 시작"}
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            className="w-full text-sm"
            onClick={() => router.push("/trpg/lobby")}
          >
            방 나가기
          </Button>
        </div>
      </div>
    </div>
  );
}
