"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

interface Props {
  /** Supabase Storage URL or null while generating */
  portraitUrl?: string | null;
  /** Seed for DiceBear fallback avatar (character name or NPC name) */
  seed: string;
  size?: number;
  className?: string;
  /** Show generate button for player's own character */
  onGenerate?: () => void;
  generating?: boolean;
}

function diceBearUrl(seed: string, size: number) {
  return `https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(seed)}&size=${size}`;
}

export default function Portrait({
  portraitUrl,
  seed,
  size = 64,
  className = "",
  onGenerate,
  generating = false,
}: Props) {
  const [imgError, setImgError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setImgError(false);
    setLoaded(false);
  }, [portraitUrl]);

  const src = !imgError && portraitUrl ? portraitUrl : diceBearUrl(seed, size);

  return (
    <div
      className={`relative overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={seed}
        width={size}
        height={size}
        className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setImgError(true);
          setLoaded(true);
        }}
      />

      {/* Generate button overlay */}
      {onGenerate && !portraitUrl && (
        <button
          onClick={onGenerate}
          disabled={generating}
          title="AI 초상화 생성"
          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100 disabled:cursor-wait"
        >
          {generating ? (
            <span className="text-xs text-white">생성 중…</span>
          ) : (
            <span className="text-lg">✨</span>
          )}
        </button>
      )}
    </div>
  );
}
