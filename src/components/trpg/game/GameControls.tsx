"use client";

interface Props {
  amIHost: boolean;
  onLeave: () => void;
  onSave: () => void;
  onDelete: () => void;
  saveStatus: "idle" | "saving" | "saved";
}

export default function GameControls({ amIHost, onLeave, onSave, onDelete, saveStatus }: Props) {
  return (
    <div className="rounded-xl border border-black/10 bg-black/[0.04] p-4 dark:border-white/10 dark:bg-white/5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500">
        방 관리
      </p>
      <div className="flex flex-col gap-2">
        <button
          onClick={onLeave}
          className="w-full rounded-lg border border-black/10 bg-white/60 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:border-neutral-400/50 hover:bg-neutral-100 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300 dark:hover:border-white/20 dark:hover:bg-white/10"
        >
          나가기
        </button>

        {amIHost && (
          <>
            <button
              onClick={onSave}
              disabled={saveStatus === "saving"}
              className="w-full rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-left text-sm text-blue-700 transition-colors hover:bg-blue-500/10 disabled:opacity-50 dark:text-blue-400"
            >
              {saveStatus === "saving"
                ? "저장 중..."
                : saveStatus === "saved"
                  ? "저장됨 ✓"
                  : "저장"}
            </button>
            <button
              onClick={onDelete}
              className="w-full rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-left text-sm text-red-700 transition-colors hover:bg-red-500/10 dark:text-red-400"
            >
              방 제거
            </button>
          </>
        )}
      </div>
    </div>
  );
}
