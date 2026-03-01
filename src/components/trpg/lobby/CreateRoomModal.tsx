"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

interface CreateRoomModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (sessionId: string) => void;
}

export default function CreateRoomModal({
  open,
  onClose,
  onCreated,
}: CreateRoomModalProps) {
  const [roomName, setRoomName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/trpg/game/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_name: roomName.trim(),
          max_players: maxPlayers,
          scenario_id: "default", // TODO: 시나리오 선택 UI
          host_player_id: "user_id", // TODO: 실제 유저 ID
        }),
      });
      const data = await res.json();
      if (data.session?.id) {
        onCreated(data.session.id);
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="새 방 만들기">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-sm text-neutral-400">방 이름</label>
          <input
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="모험의 시작..."
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-white/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-neutral-400">
            최대 인원 ({maxPlayers}명)
          </label>
          <input
            type="range"
            min={1}
            max={7}
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" type="submit" disabled={loading || !roomName.trim()}>
            {loading ? "생성 중..." : "방 만들기"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
