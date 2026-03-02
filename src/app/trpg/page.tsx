import Link from "next/link";

export default function TrpgHubPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="mb-10 text-center">
        <h1 className="mb-3 text-4xl font-bold text-neutral-900 dark:text-white">⚔️ TRPG</h1>
        <p className="text-neutral-500 dark:text-neutral-400">
          AI 게임 마스터와 함께하는 실시간 멀티플레이어 텍스트 롤플레잉 게임
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/trpg/lobby"
          className="rounded-xl border border-black/10 bg-black/[0.04] p-6 transition-colors hover:border-black/20 hover:bg-black/8 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 dark:hover:bg-white/10"
        >
          <h2 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-white">로비 입장</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            방 목록을 확인하고 게임에 참여하거나 새 방을 만드세요.
          </p>
        </Link>

        <Link
          href="/trpg/character/create"
          className="rounded-xl border border-black/10 bg-black/[0.04] p-6 transition-colors hover:border-black/20 hover:bg-black/8 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 dark:hover:bg-white/10"
        >
          <h2 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-white">캐릭터 생성</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            성향 테스트를 통해 나만의 캐릭터를 만들어보세요.
          </p>
        </Link>
      </div>
    </div>
  );
}
