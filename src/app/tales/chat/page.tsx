"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CharacterCard from "@/components/chat/CharacterCard";
import CharacterForm from "@/components/chat/CharacterForm";
import type { AiCharacter, AiCharacterPublic } from "@/lib/chat/types";

function getLocalId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("localId");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("localId", id); }
  return id;
}

export default function ChatListPage() {
  const router = useRouter();
  const [localId, setLocalId] = useState("");
  const [mine, setMine] = useState<AiCharacter[]>([]);
  const [pub, setPub] = useState<AiCharacterPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const id = getLocalId();
    fetch(`/api/chat/characters?local_id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then(({ mine: m, public: p }) => {
        setLocalId(id);
        setMine(m ?? []);
        setPub(p ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(values: {
    name: string; bio: string; personality: string; creator_bio: string; is_public: boolean;
  }) {
    const res = await fetch("/api/chat/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ local_id: localId, ...values }),
    });
    if (!res.ok) return;
    const created: AiCharacter = await res.json();
    router.push(`/tales/chat/${created.id}`);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  // 생성 폼
  if (showForm) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => setShowForm(false)}
            className="text-lg text-neutral-500 hover:text-neutral-300"
          >
            ←
          </button>
          <h1 className="text-lg font-bold text-white">캐릭터 만들기</h1>
        </div>
        <CharacterForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      </div>
    );
  }

  // 빈 상태
  if (mine.length === 0 && pub.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="text-5xl">💬</div>
        <div>
          <p className="text-lg font-semibold text-white">아직 캐릭터가 없어요</p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-500">
            나만의 AI 캐릭터를 만들고<br />대화를 시작해 보세요.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-xl bg-purple-500 px-6 py-2.5 text-sm font-semibold text-black hover:opacity-90"
        >
          + 캐릭터 만들기
        </button>
      </div>
    );
  }

  // 목록
  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">AI 채팅</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-lg text-white hover:bg-white/[0.05]"
        >
          +
        </button>
      </div>

      {mine.length > 0 && (
        <>
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
            내 캐릭터
          </p>
          <div className="mb-6 flex flex-col gap-2">
            {mine.map((c) => (
              <CharacterCard key={c.id} character={c} onClick={() => router.push(`/tales/chat/${c.id}`)} />
            ))}
          </div>
        </>
      )}

      {pub.length > 0 && (
        <>
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
            공개 캐릭터
          </p>
          <div className="flex flex-col gap-2">
            {pub.map((c) => (
              <CharacterCard key={c.id} character={c} onClick={() => router.push(`/tales/chat/${c.id}`)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
