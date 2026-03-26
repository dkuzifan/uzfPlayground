import type { Metadata } from "next";
import {
  Geist, Geist_Mono,
  Cinzel, Crimson_Text,
  Special_Elite,
  Orbitron,
  IM_Fell_English,
} from "next/font/google";
import { Toaster } from "sonner";
import Navbar from "@/components/layout/Navbar";
import "./globals.css";

// ── 기본 폰트 ─────────────────────────────────────────────────────
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// ── 시나리오 테마 폰트 ────────────────────────────────────────────
const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const crimsonText = Crimson_Text({
  variable: "--font-crimson",
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
});

const specialElite = Special_Elite({
  variable: "--font-special-elite",
  subsets: ["latin"],
  weight: "400",
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const imFellEnglish = IM_Fell_English({
  variable: "--font-im-fell",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "PLGRND uzifan",
  description: "Personal portal site",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const fontVars = [
    geistSans.variable,
    geistMono.variable,
    cinzel.variable,
    crimsonText.variable,
    specialElite.variable,
    orbitron.variable,
    imFellEnglish.variable,
  ].join(" ");

  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 다크 모드 깜빡임 방지 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}})()`,
          }}
        />
      </head>
      <body className={`${fontVars} min-h-screen bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-white`}>
        <Navbar />
        <main>{children}</main>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
