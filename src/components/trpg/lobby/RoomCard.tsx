"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LobbySession } from "@/lib/types/lobby";
import type { CharacterCreationConfig } from "@/lib/types/character";
import { useGuestProfile } from "@/hooks/useGuestProfile";

import JoinRoomModal from "./JoinRoomModal";

interface RoomCardProps {
  session: LobbySession;
}

export default function RoomCard({ session }: RoomCardProps) {
  const router = useRouter();
  const { profile, saveProfile } = useGuestProfile();
  const isFull = session.player_count >= session.max_players;

  const [checking, setChecking] = useState(false);
  const [joinModal, setJoinModal] = useState<{
    scenarioTitle: string;
    config: CharacterCreationConfig;
  } | null>(null);

  async function handleEnter() {
    if (isFull || !profile) return;
    setChecking(true);

    try {
      const res = await fetch(
        `/api/trpg/sessions/${session.id}/my-character?localId=${profile.localId}`
      );
      const data = await res.json();

      if (res.status === 409) {
        alert(data.error ?? "이미 시작된 방입니다.");
        return;
      }
      if (!res.ok) {
        alert(data.error ?? "입장 확인에 실패했습니다.");
        return;
      }

      if (data.exists) {
        // 이미 참여 중 → 바로 대기실
        router.push(`/trpg/lobby/${session.id}`);
      } else {
        // 신규 참여 → 캐릭터 생성 모달
        setJoinModal({
          scenarioTitle: data.scenario?.title ?? session.scenario_title,
          config: data.scenario?.character_creation_config,
        });
      }
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <div
        className={`rounded-xl border border-black/10 bg-black/[0.04] p-5 transition-colors hover:border-black/20 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 ${
          isFull ? "opacity-60" : ""
        }`}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="font-semibold text-neutral-900 dark:text-white">{session.room_name}</h3>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              isFull
                ? "bg-red-500/15 text-red-600 dark:bg-red-500/20 dark:text-red-400"
                : "bg-green-500/15 text-green-700 dark:bg-green-500/20 dark:text-green-400"
            }`}
          >
            {isFull ? "만석" : "참여 가능"}
          </span>
        </div>

        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          {session.scenario_title}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500">
            👥 {session.player_count}/{session.max_players}명
          </span>
          {isFull ? (
            <span className="rounded-md px-3 py-1.5 text-xs font-medium text-neutral-400">
              입장 불가
            </span>
          ) : (
            <button
              onClick={handleEnter}
              disabled={checking || !profile}
              className="rounded-md bg-black/8 px-3 py-1.5 text-xs font-medium text-neutral-900 transition-colors hover:bg-black/15 disabled:opacity-50 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            >
              {checking ? "확인 중…" : "입장"}
            </button>
          )}
        </div>
      </div>

      {joinModal && profile && (
        <JoinRoomModal
          open={true}
          onClose={() => setJoinModal(null)}
          sessionId={session.id}
          localId={profile.localId}
          scenarioTitle={joinModal.scenarioTitle}
          config={joinModal.config}
          onSaveProfile={saveProfile}
        />
      )}
    </>
  );
}
