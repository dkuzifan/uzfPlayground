"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // 이미 인증된 세션이 있으면 이메일 발송 없이 PIN 화면으로 바로 이동
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/pin");
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("sending");
    setErrorMsg("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    });

    if (error) {
      setErrorMsg(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            <span className="font-mono">PLGRND</span>{" "}
            <span className="font-sans font-normal">uzifan</span>
          </h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            이메일로 로그인하세요
          </p>
        </div>

        {status === "sent" ? (
          <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-6 text-center">
            <p className="text-lg font-semibold text-green-700 dark:text-green-400">
              메일을 확인하세요
            </p>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                {email}
              </span>
              으로 인증 링크를 보냈습니다.
            </p>
            <button
              onClick={() => { setStatus("idle"); setEmail(""); }}
              className="mt-4 text-sm text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              다른 이메일로 시도
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 주소"
              required
              className="w-full rounded-lg border border-black/10 bg-white px-4 py-3 text-sm text-neutral-900 outline-none placeholder-neutral-400 focus:border-neutral-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-neutral-500 dark:focus:border-white/30"
            />
            {status === "error" && (
              <p className="text-xs text-red-500">{errorMsg}</p>
            )}
            <button
              type="submit"
              disabled={status === "sending" || !email.trim()}
              className="w-full rounded-lg bg-neutral-900 py-3 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              {status === "sending" ? "전송 중..." : "인증 메일 발송"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
