"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import RoomCard from "@/components/trpg/lobby/RoomCard";
import CreateRoomModal from "@/components/trpg/lobby/CreateRoomModal";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import type { LobbySession } from "@/lib/types/lobby";

const DRAFT_KEY = "trpg_onboarding_draft";

export default function LobbyPage() {
  const { profile, mounted, saveProfile } = useAuthProfile();
  const [sessions, setSessions] = useState<LobbySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [resumeDraft, setResumeDraft] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    try { setHasDraft(!!sessionStorage.getItem(DRAFT_KEY)); } catch { /* ignore */ }
  }, []);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tales/trpg/sessions");
      if (res.ok) setSessions(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">

      {/* 이어하기 배너 */}
      {mounted && hasDraft && (
        <div className="mb-5 flex items-center justify-between rounded-2xl border border-yellow-400/40 bg-yellow-400/8 px-4 py-3">
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            🔖 이전에 진행 중이던 캐릭터 생성이 있습니다.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setResumeDraft(true); setCreateOpen(true); }}
              className="rounded-lg bg-yellow-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-yellow-600"
            >
              이어서 하기
            </button>
            <button
              onClick={() => { sessionStorage.removeItem(DRAFT_KEY); setHasDraft(false); }}
              className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-400">TRPG</p>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">로비</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            참여할 방을 선택하거나 새로 만드세요
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchSessions}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-600 transition hover:border-black/20 hover:bg-neutral-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300 dark:hover:bg-white/10"
          >
            {loading ? (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" />
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            )}
            새로고침
          </button>
          {mounted && (
            <button
              onClick={() => setCreateOpen(true)}
              className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              + 방 만들기
            </button>
          )}
        </div>
      </div>

      {/* 방 목록 */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex h-52 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-black/15 dark:border-white/15"
        >
          <p className="text-3xl">🏠</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">아직 열린 방이 없습니다.</p>
          {mounted && (
            <button
              onClick={() => setCreateOpen(true)}
              className="mt-1 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900"
            >
              첫 번째 방 만들기
            </button>
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session, i) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, transition: { delay: i * 0.06 } }}
            >
              <RoomCard session={session} />
            </motion.div>
          ))}
        </div>
      )}

      {mounted && profile && (
        <CreateRoomModal
          open={createOpen}
          onClose={() => { setCreateOpen(false); setResumeDraft(false); setHasDraft(false); }}
          profile={profile}
          onSaveProfile={saveProfile}
          resumeDraft={resumeDraft}
        />
      )}
    </div>
  );
}
