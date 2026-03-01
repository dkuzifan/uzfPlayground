"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import type { ActionChoice } from "@/lib/types/game";

interface ActionPanelProps {
  choices: ActionChoice[];
  isMyTurn: boolean;
  onChoice: (choice: ActionChoice) => void;
  onFreeInput: (text: string) => void;
}

export default function ActionPanel({
  choices,
  isMyTurn,
  onChoice,
  onFreeInput,
}: ActionPanelProps) {
  const [freeText, setFreeText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!freeText.trim()) return;
    onFreeInput(freeText.trim());
    setFreeText("");
  };

  if (!isMyTurn) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-neutral-500">
        다른 플레이어의 턴입니다...
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
        행동 선택
      </p>

      {/* 성향 기반 선택지 3개 */}
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {choices.map((choice) => (
          <button
            key={choice.id}
            onClick={() => onChoice(choice)}
            className="rounded-lg border border-white/10 bg-white/5 p-3 text-left text-sm transition-colors hover:border-white/20 hover:bg-white/10"
          >
            <div className="mb-1 font-medium text-white">{choice.label}</div>
            <div className="text-xs text-neutral-400">{choice.description}</div>
          </button>
        ))}
      </div>

      {/* 직접 입력 */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder="직접 행동을 입력하세요..."
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-white/20"
        />
        <Button type="submit" variant="primary" size="sm" disabled={!freeText.trim()}>
          선언
        </Button>
      </form>
    </div>
  );
}
