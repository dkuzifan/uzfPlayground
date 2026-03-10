"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import type { GuestProfile } from "@/lib/types/lobby";

interface CreateRoomModalProps {
  open: boolean;
  onClose: () => void;
  profile: GuestProfile;
}

export default function CreateRoomModal({
  open,
  onClose,
  profile,
}: CreateRoomModalProps) {
  const router = useRouter();
  const [roomName, setRoomName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomNameError =
    roomName.trim().length === 0 && roomName.length > 0
      ? "방 이름을 입력해주세요."
      : roomName.length > 20
      ? "방 이름은 최대 20자입니다."
      : null;

  const canSubmit = roomName.trim().length > 0 && roomName.length <= 20 && !loading;

  async function handleCreate() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/trpg/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_name: roomName.trim(),
          max_players: maxPlayers,
          localId: profile.localId,
          nickname: profile.nickname,
          avatarIndex: profile.avatarIndex,
          ...(profile.characterName ? { characterName: profile.characterName } : {}),
          ...(profile.job ? { job: profile.job } : {}),
          ...(profile.personality ? { personality: profile.personality } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "방 생성에 실패했습니다.");
        return;
      }

      router.push(`/trpg/lobby/${data.sessionId}`);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="방 만들기">
      {/* 방 이름 */}
      <div className="mb-5">
        <label className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
          방 이름 <span className="text-red-500 dark:text-red-400">*</span>
        </label>
        <input
          type="text"
          maxLength={21}
          placeholder="예: 판타지 대모험"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          className="w-full rounded-lg border border-black/15 bg-white/70 px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 outline-none focus:border-yellow-500/60 dark:border-white/20 dark:bg-white/5 dark:text-white dark:placeholder-neutral-500"
          autoFocus
        />
        {roomNameError ? (
          <p className="mt-1 text-xs text-red-500 dark:text-red-400">{roomNameError}</p>
        ) : (
          <p className="mt-1 text-xs text-neutral-500">최대 20자</p>
        )}
      </div>

      {/* 최대 인원 */}
      <div className="mb-6">
        <label className="mb-2 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
          최대 인원{" "}
          <span className="font-bold text-yellow-600 dark:text-yellow-400">{maxPlayers}명</span>
        </label>
        <input
          type="range"
          min={2}
          max={7}
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(Number(e.target.value))}
          className="w-full accent-yellow-500 dark:accent-yellow-400"
        />
        <div className="mt-1 flex justify-between text-xs text-neutral-500">
          <span>2명</span>
          <span>7명</span>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose} disabled={loading}>
          취소
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={!canSubmit}
          onClick={handleCreate}
        >
          {loading ? "생성 중…" : "만들기"}
        </Button>
      </div>
    </Modal>
  );
}
