"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import ChatScreen from "@/components/chat/ChatScreen";
import type { AiCharacter, AiCharacterPublic } from "@/lib/chat/types";

function getLocalId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("localId");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("localId", id); }
  return id;
}

export default function ChatPage({ params }: { params: Promise<{ characterId: string }> }) {
  const { characterId } = use(params);
  const router = useRouter();
  const [localId, setLocalId] = useState("");
  const [character, setCharacter] = useState<AiCharacter | AiCharacterPublic | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const id = getLocalId();

    fetch(`/api/chat/characters?local_id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then(({ mine, public: pub }) => {
        const all = [...(mine ?? []), ...(pub ?? [])];
        const found = all.find((c: AiCharacter | AiCharacterPublic) => c.id === characterId);
        setLocalId(id);
        if (found) setCharacter(found);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true));
  }, [characterId]);

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
        <p className="text-neutral-400">캐릭터를 찾을 수 없어요.</p>
        <button
          onClick={() => router.push("/tales/chat")}
          className="text-sm text-purple-400 hover:underline"
        >
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  if (!character || !localId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  return <ChatScreen character={character} localId={localId} />;
}
