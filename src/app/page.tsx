import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-20 text-center">
      <h1 className="mb-4 text-4xl font-bold text-white">Portal</h1>
      <p className="mb-12 text-neutral-400">개인 포털 사이트에 오신 것을 환영합니다.</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/trpg"
          className="group rounded-xl border border-white/10 bg-white/5 p-6 text-left transition-colors hover:border-white/20 hover:bg-white/10"
        >
          <div className="mb-3 text-2xl">⚔️</div>
          <h2 className="mb-1 text-lg font-semibold text-white">TRPG</h2>
          <p className="text-sm text-neutral-400">
            AI GM과 함께하는 멀티플레이어 텍스트 TRPG
          </p>
        </Link>
      </div>
    </div>
  );
}
