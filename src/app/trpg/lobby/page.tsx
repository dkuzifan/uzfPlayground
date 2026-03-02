"use client";

import { useState, useEffect, useCallback } from "react";
import RoomCard from "@/components/trpg/lobby/RoomCard";
import CreateRoomModal from "@/components/trpg/lobby/CreateRoomModal";
import GuestProfileModal from "@/components/trpg/lobby/GuestProfileModal";
import Button from "@/components/ui/Button";
import { useGuestProfile } from "@/hooks/useGuestProfile";
import type { LobbySession } from "@/lib/types/lobby";

export default function LobbyPage() {
  const { profile, mounted, saveProfile } = useGuestProfile();
  const [sessions, setSessions] = useState<LobbySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/trpg/sessions");
      if (res.ok) {
        const data: LobbySession[] = await res.json();
        setSessions(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* 헤더 */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">TRPG 로비</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            참여할 방을 선택하거나 새로 만드세요
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchSessions}
            disabled={loading}
          >
            {loading ? (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M23 4v6h-6M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            )}
            새로고침
          </Button>
          {mounted && profile && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreateOpen(true)}
            >
              + 방 만들기
            </Button>
          )}
        </div>
      </div>

      {/* 방 목록 */}
      {loading ? (
        <div className="flex h-40 items-center justify-center text-neutral-500 text-sm">
          방 목록 불러오는 중…
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-neutral-500">
          <p className="text-2xl">🏠</p>
          <p className="text-sm">아직 열린 방이 없습니다.</p>
          {mounted && profile && (
            <button
              onClick={() => setCreateOpen(true)}
              className="mt-1 text-sm text-yellow-500 hover:underline"
            >
              첫 번째 방을 만들어보세요!
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => (
            <RoomCard key={session.id} session={session} />
          ))}
        </div>
      )}

      {/* 프로필 설정 모달 (로비 첫 방문 시) */}
      {mounted && (
        <GuestProfileModal
          open={profile === null}
          onSave={saveProfile}
        />
      )}

      {/* 방 만들기 모달 */}
      {mounted && profile && (
        <CreateRoomModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          profile={profile}
        />
      )}
    </div>
  );
}
