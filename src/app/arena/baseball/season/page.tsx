import Link from "next/link"

export default function SeasonPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <p className="text-neutral-400 dark:text-neutral-500">시즌 모드 준비 중</p>
      <Link
        href="/arena/baseball"
        className="text-sm text-neutral-500 transition-colors hover:text-neutral-300"
      >
        ← 타이틀로 돌아가기
      </Link>
    </div>
  )
}
