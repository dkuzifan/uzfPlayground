import Link from "next/link";

const GAMES = [
  {
    href: "/arena/baseball",
    icon: "⚾",
    title: "야구 시뮬레이터",
    description: "투구 단위로 진행되는 실시간 야구 시뮬레이션",
    soon: true,
  },
];

export default function ArenaPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="mb-10 text-center">
        <h1 className="mb-3 text-4xl font-bold text-neutral-900 dark:text-white">🏟️ Arena</h1>
        <p className="text-neutral-500 dark:text-neutral-400">
          데이터와 시뮬레이션으로 펼쳐지는 스포츠 공간
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {GAMES.map(({ href, icon, title, description, soon }) => (
          <Link
            key={href}
            href={soon ? "#" : href}
            className={`relative rounded-xl border border-black/10 bg-black/[0.04] p-6 transition-colors dark:border-white/10 dark:bg-white/5 ${
              soon
                ? "cursor-not-allowed opacity-50"
                : "hover:border-black/20 hover:bg-black/8 dark:hover:border-white/20 dark:hover:bg-white/10"
            }`}
          >
            {soon && (
              <span className="absolute right-3 top-3 rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-semibold text-neutral-500 dark:bg-white/10 dark:text-neutral-400">
                준비 중
              </span>
            )}
            <h2 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-white">
              {icon} {title}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
