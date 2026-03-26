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
    <div className="rounded-xl p-3" style={{ border: "1px solid var(--skin-border)", background: "var(--skin-bg-card)" }}>
      <p
        className="mb-2 text-[9px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--skin-text-muted)", fontFamily: "var(--skin-font-display)" }}
      >
        방 관리
      </p>
      <div className="flex flex-col gap-1.5">
        <button
          onClick={onLeave}
          className="w-full rounded-lg px-3 py-2 text-left text-xs transition"
          style={{
            border: "1px solid var(--skin-border)",
            background: "var(--skin-bg-secondary)",
            color: "var(--skin-text-muted)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--skin-text)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--skin-accent)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--skin-text-muted)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--skin-border)";
          }}
        >
          나가기
        </button>

        {amIHost && (
          <>
            <button
              onClick={onSave}
              disabled={saveStatus === "saving"}
              className="w-full rounded-lg px-3 py-2 text-left text-xs transition disabled:opacity-50"
              style={{
                border: "1px solid rgba(96,165,250,0.3)",
                background: "rgba(96,165,250,0.06)",
                color: "#60a5fa",
              }}
            >
              {saveStatus === "saving" ? "저장 중..." : saveStatus === "saved" ? "저장됨 ✓" : "저장"}
            </button>
            <button
              onClick={onDelete}
              className="w-full rounded-lg px-3 py-2 text-left text-xs transition"
              style={{
                border: "1px solid rgba(248,113,113,0.3)",
                background: "rgba(248,113,113,0.06)",
                color: "#f87171",
              }}
            >
              방 제거
            </button>
          </>
        )}
      </div>
    </div>
  );
}
