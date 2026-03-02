"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { AVATAR_COLORS } from "@/lib/types/lobby";
import type { GuestProfile } from "@/lib/types/lobby";

interface GuestProfileModalProps {
  open: boolean;
  onSave: (profile: Omit<GuestProfile, "localId">) => void;
}

export default function GuestProfileModal({ open, onSave }: GuestProfileModalProps) {
  const [nickname, setNickname] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState<number | null>(null);

  const nicknameError =
    nickname.trim().length === 0 && nickname.length > 0
      ? "공백만으로는 사용할 수 없습니다."
      : nickname.length > 12
      ? "닉네임은 최대 12자입니다."
      : null;

  const canSubmit =
    nickname.trim().length > 0 &&
    nickname.length <= 12 &&
    selectedAvatar !== null;

  function handleSubmit() {
    if (!canSubmit || selectedAvatar === null) return;
    onSave({ nickname: nickname.trim(), avatarIndex: selectedAvatar });
  }

  return (
    <Modal open={open} onClose={() => {}} title="">
      <div className="mb-1 text-lg font-bold text-white">
        환영합니다! 프로필을 설정하세요
      </div>
      <p className="mb-6 text-sm text-neutral-400">
        닉네임과 아바타를 설정하면 바로 시작할 수 있습니다.
      </p>

      {/* 닉네임 */}
      <div className="mb-5">
        <label className="mb-1.5 block text-xs font-medium text-neutral-400">
          닉네임 <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          maxLength={13}
          placeholder="예: 용사 김철수"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-yellow-500/60"
          autoFocus
        />
        {nicknameError && (
          <p className="mt-1 text-xs text-red-400">{nicknameError}</p>
        )}
        {!nicknameError && (
          <p className="mt-1 text-xs text-neutral-500">최대 12자 · 공백만 입력 불가</p>
        )}
      </div>

      {/* 아바타 */}
      <div className="mb-6">
        <label className="mb-2 block text-xs font-medium text-neutral-400">
          아바타 <span className="text-red-400">*</span>
        </label>
        <div className="flex flex-wrap gap-3">
          {Object.entries(AVATAR_COLORS).map(([idx, colorClass]) => {
            const i = Number(idx);
            const isSelected = selectedAvatar === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedAvatar(i)}
                className={`h-12 w-12 rounded-full transition-transform hover:scale-110 ${colorClass} ${
                  isSelected
                    ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-neutral-900"
                    : ""
                }`}
                aria-label={`아바타 ${i + 1}`}
              />
            );
          })}
        </div>
        {selectedAvatar === null && (
          <p className="mt-1.5 text-xs text-neutral-500">아바타를 선택해주세요 (추후 캐릭터 이미지로 교체 예정)</p>
        )}
      </div>

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        완료하고 시작하기
      </Button>
    </Modal>
  );
}
