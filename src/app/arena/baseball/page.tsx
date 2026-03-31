import Link from "next/link"

export default function BaseballPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-16">
      {/* 배경 그라디언트 */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(34,197,94,0.10)_0%,transparent_70%)]" />

      <div className="flex w-full max-w-md flex-col items-center gap-10">

        {/* 타이틀 */}
        <div className="text-center">
          <div className="mb-4 text-6xl drop-shadow-[0_0_24px_rgba(34,197,94,0.4)]">⚾</div>
          <h1 className="mb-3 text-3xl font-bold text-neutral-900 dark:text-white">야구 시뮬레이터</h1>
          <p className="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
            팀을 골라 직접 감독이 되거나<br />풀 시뮬레이션으로 경기를 돌려보세요
          </p>
        </div>

        {/* 모드 선택 */}
        <div className="flex w-full flex-col gap-3 sm:flex-row">

          {/* 한 경기 플레이 */}
          <Link
            href="/arena/baseball/setup"
            className="flex flex-1 items-center gap-4 rounded-xl border border-green-500/30 bg-green-500/8 p-5 transition-colors hover:border-green-500/50 hover:bg-green-500/14 sm:flex-col sm:items-start"
          >
            <span className="text-3xl">🆚</span>
            <div>
              <p className="font-semibold text-neutral-900 dark:text-white">한 경기 플레이</p>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">팀 선택 후 바로 게임 시작</p>
            </div>
          </Link>

          {/* 시즌 모드 (비활성) */}
          <div
            aria-disabled="true"
            className="relative flex flex-1 cursor-not-allowed items-center gap-4 rounded-xl border border-black/8 bg-black/[0.03] p-5 opacity-50 dark:border-white/8 dark:bg-white/[0.03] sm:flex-col sm:items-start"
          >
            <span className="absolute right-3 top-3 rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-semibold text-neutral-500 dark:bg-white/10 dark:text-neutral-400">
              준비 중
            </span>
            <span className="text-3xl">🗓️</span>
            <div>
              <p className="font-semibold text-neutral-400 dark:text-neutral-500">시즌 모드</p>
              <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-600">페넌트레이스 · 포스트시즌</p>
            </div>
          </div>

        </div>

        {/* 뒤로가기 */}
        <Link
          href="/arena"
          className="text-sm text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          ← Arena로 돌아가기
        </Link>

      </div>
    </div>
  )
}
