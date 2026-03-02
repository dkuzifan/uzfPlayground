"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/trpg", label: "TRPG" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-black/10 bg-white/80 backdrop-blur-sm dark:border-white/10 dark:bg-neutral-900/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        {/* 로고 */}
        <Link
          href="/"
          className="shrink-0 text-base font-semibold text-neutral-900 dark:text-white"
        >
          <span className="font-mono tracking-tight">PLGRND</span>{" "}
          <span className="font-sans font-normal">uzifan</span>
        </Link>

        {/* 좌측 내비게이션 */}
        <ul className="flex flex-1 items-center gap-1">
          {navLinks.map(({ href, label }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-black/10 text-neutral-900 dark:bg-white/10 dark:text-white"
                      : "text-neutral-500 hover:bg-black/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-white"
                  }`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* 우측: 다크 모드 토글 */}
        <ThemeToggle />
      </div>
    </nav>
  );
}
