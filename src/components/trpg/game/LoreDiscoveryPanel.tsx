"use client";

import { useState } from "react";
import type { ActionLog } from "@/lib/trpg/types/game";

interface Props {
  logs: ActionLog[];
  myPlayerId?: string;
}

export default function LoreDiscoveryPanel({ logs, myPlayerId }: Props) {
  const [open, setOpen] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const loreLogs = logs.filter(
    (l) => l.action_type === "lore_discovery" && (!l.is_private || l.speaker_id === myPlayerId)
  );
  const count = loreLogs.length;

  return (
    <div className="rounded-xl" style={{ border: "1px solid var(--skin-border)", background: "var(--skin-bg-card)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="text-sm">📜</span>
        <span className="flex-1 text-[11px] font-semibold" style={{ color: "var(--skin-text)" }}>
          발견한 단서
        </span>
        {count > 0 && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
            style={{ background: "var(--skin-accent-glow)", color: "var(--skin-accent)" }}
          >
            {count}
          </span>
        )}
        <span className="text-[10px]" style={{ color: "var(--skin-text-muted)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-2 pb-2 pt-1" style={{ borderTop: "1px solid var(--skin-border)" }}>
          {count === 0 ? (
            <p className="py-3 text-center text-[11px]" style={{ color: "var(--skin-text-muted)" }}>
              아직 발견한 단서가 없습니다
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {loreLogs.map((log, idx) => {
                const isExpanded = expandedIdx === idx;
                const preview = log.content.split("\n")[0].slice(0, 40);
                const hasMore = log.content.length > preview.length;

                return (
                  <button
                    key={log.id}
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                    className="w-full rounded-lg px-2.5 py-2 text-left transition"
                    style={{
                      border: "1px solid var(--skin-accent)",
                      background: "var(--skin-accent-glow)",
                    }}
                  >
                    <div className="flex items-start gap-1.5">
                      <span className="mt-0.5 text-[11px]" style={{ color: "var(--skin-accent)" }}>📌</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] leading-snug" style={{ color: "var(--skin-text)" }}>
                          {isExpanded ? log.content : `${preview}${hasMore ? "…" : ""}`}
                        </p>
                        {log.is_private && (
                          <span className="mt-0.5 block text-[10px]" style={{ color: "var(--skin-text-muted)" }}>
                            🔒 나만 아는 단서
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
