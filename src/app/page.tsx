"use client";

import Link from "next/link";
import GuestProfileModal from "@/components/trpg/lobby/GuestProfileModal";
import { useGuestProfile } from "@/hooks/useGuestProfile";

export default function HomePage() {
  const { profile, mounted, saveProfile } = useGuestProfile();

  return (
    <>
      {/* 첫 방문 시 프로필 설정 모달 */}
      {mounted && (
        <GuestProfileModal
          open={profile === null}
          onSave={saveProfile}
        />
      )}

      <div className="mx-auto max-w-4xl px-4 py-20 text-center">
        <h1 className="mb-4 text-4xl font-bold text-neutral-900 dark:text-white">
          <span className="font-mono tracking-tight">PLGRND</span>{" "}
          <span className="font-sans font-normal">uzifan</span>
        </h1>
        <p className="mb-12 text-neutral-500 dark:text-neutral-400">
          개인 포털 사이트에 오신 것을 환영합니다.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/trpg"
            className="group rounded-xl border border-black/10 bg-black/[0.04] p-6 text-left transition-colors hover:border-black/20 hover:bg-black/8 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 dark:hover:bg-white/10"
          >
            <div className="mb-3 text-2xl">⚔️</div>
            <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-white">TRPG</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              AI GM과 함께하는 멀티플레이어 텍스트 TRPG
            </p>
          </Link>
        </div>
      </div>
    </>
  );
}
