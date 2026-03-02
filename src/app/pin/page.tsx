"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const PIN_LENGTH = 6;

function PinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(""));
  const [status, setStatus] = useState<"idle" | "verifying" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const char = value.slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    if (char && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pin = digits.join("");
    if (pin.length < PIN_LENGTH) return;

    setStatus("verifying");
    setErrorMsg("");

    const res = await fetch("/api/auth/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });

    if (res.ok) {
      router.replace(next);
    } else {
      const data = await res.json();
      setErrorMsg(data.error ?? "잘못된 PIN입니다.");
      setStatus("error");
      setDigits(Array(PIN_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    }
  }

  const pin = digits.join("");

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            PIN 입력
          </h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            6자리 공통 PIN을 입력하세요
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col items-center gap-6">
          <div className="flex gap-2">
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="h-12 w-10 rounded-lg border border-black/10 bg-white text-center text-lg font-bold text-neutral-900 outline-none focus:border-neutral-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-white/40"
              />
            ))}
          </div>

          {status === "error" && (
            <p className="text-sm text-red-500">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={pin.length < PIN_LENGTH || status === "verifying"}
            className="w-full rounded-lg bg-neutral-900 py-3 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            {status === "verifying" ? "확인 중..." : "입력"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function PinPage() {
  return (
    <Suspense>
      <PinForm />
    </Suspense>
  );
}
