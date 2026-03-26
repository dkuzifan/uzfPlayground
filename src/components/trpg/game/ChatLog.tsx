"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { ActionLog, DiceRoll, HpChange } from "@/lib/trpg/types/game";

interface Props {
  logs: ActionLog[];
  myPlayerId?: string;
}

// ── 주사위 결과 카드 ────────────────────────────────────
function DiceRollCard({ dice, outcome }: { dice: DiceRoll; outcome: string | null }) {
  const cfg = {
    great_success: { num: "text-yellow-400", label: "⚡ 대성공", glow: "0 0 20px rgba(250,204,21,0.4)" },
    success:       { num: "text-green-400",  label: "✦ 성공",    glow: "0 0 12px rgba(74,222,128,0.3)" },
    failure:       { num: "text-red-400",    label: "✕ 실패",    glow: "none" },
  }[outcome ?? "failure"] ?? { num: "text-red-400", label: "✕ 실패", glow: "none" };

  return (
    <div
      className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5"
      style={{
        background: "var(--skin-bg-secondary)",
        border: "1px solid var(--skin-border)",
        boxShadow: cfg.glow,
      }}
    >
      <span className={`text-3xl font-black tabular-nums ${cfg.num}`} style={{ fontFamily: "var(--skin-font-display)" }}>
        {dice.rolled}
      </span>
      <div>
        <p className="text-xs" style={{ color: "var(--skin-text-muted)" }}>
          d20({dice.rolled}) + {dice.modifier} = {dice.total}
        </p>
        <p className={`text-sm font-bold ${cfg.num}`}>{cfg.label}</p>
      </div>
    </div>
  );
}

// ── HP 변화 카드 ────────────────────────────────────────
function HpChangeCard({ changes }: { changes: HpChange[] }) {
  if (changes.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      {changes.map((c) => (
        <div
          key={c.target_id}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm"
          style={{ background: "var(--skin-bg-secondary)", color: "var(--skin-text)" }}
        >
          <span>{c.name}</span>
          <span style={{ color: "var(--skin-text-muted)" }}>{c.old_hp} → {c.new_hp}</span>
          <span className={`ml-auto font-bold ${c.delta < 0 ? "text-red-400" : c.delta > 0 ? "text-green-400" : ""}`}>
            {c.delta > 0 ? "+" : ""}{c.delta} HP
          </span>
        </div>
      ))}
    </div>
  );
}

// ── 메시지 등장 애니메이션 ───────────────────────────────
const msgAnim = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25 },
} as const;

export default function ChatLog({ logs, myPlayerId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div
      className="flex min-h-0 flex-1 overflow-y-auto rounded-xl p-4 scrollbar-thin"
      style={{
        background: "var(--skin-bg-card)",
        border: "1px solid var(--skin-border)",
        color: "var(--skin-text)",
        fontFamily: "var(--skin-font-body)",
      }}
    >
      <div className="flex w-full flex-col gap-4">
        {logs.length === 0 && (
          <p className="py-8 text-center text-sm" style={{ color: "var(--skin-text-muted)" }}>
            게임이 시작되었습니다.
          </p>
        )}

        {logs.map((log) => {
          // 비공개 로그 필터
          if (log.is_private && log.speaker_id !== myPlayerId) return null;

          // ── 시스템 메시지 ──
          if (log.speaker_type === "system") {
            const statGrowth = (log.state_changes as { stat_growth?: { stat: string; delta: number } }).stat_growth;
            if (statGrowth) {
              return (
                <motion.div key={log.id} {...msgAnim} className="flex justify-center">
                  <div
                    className="rounded-xl px-4 py-2.5"
                    style={{ border: "1px solid var(--skin-accent)", background: "var(--skin-accent-glow)" }}
                  >
                    <p className="text-center text-xs font-semibold" style={{ color: "var(--skin-accent)" }}>
                      📈 {log.content.replace(/^\[.*?\]\s*/, "")}
                    </p>
                  </div>
                </motion.div>
              );
            }
            return (
              <motion.div key={log.id} {...msgAnim}
                className="py-0.5 text-center text-xs"
                style={{ color: "var(--skin-text-muted)" }}
              >
                — {log.content} —
                {log.is_private && <span className="ml-1">🔒</span>}
              </motion.div>
            );
          }

          // ── GM 서술 — 산문체, 중앙 정렬 ──
          if (log.speaker_type === "gm") {
            const stateChanges = log.state_changes as { hp_changes?: HpChange[]; failure_twist?: string };
            return (
              <motion.div key={log.id} {...msgAnim}
                className="flex flex-col gap-2"
              >
                {/* 구분선 */}
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1" style={{ background: "var(--skin-border)" }} />
                  <span className="text-[10px] tracking-widest" style={{ color: "var(--skin-text-muted)" }}>GM</span>
                  <div className="h-px flex-1" style={{ background: "var(--skin-border)" }} />
                </div>
                <p
                  className="px-2 text-center text-sm leading-relaxed"
                  style={{ color: "var(--skin-text)", fontStyle: "italic", fontFamily: "var(--skin-font-body)" }}
                >
                  {log.content}
                </p>
                {stateChanges.hp_changes && stateChanges.hp_changes.length > 0 && (
                  <HpChangeCard changes={stateChanges.hp_changes} />
                )}
                {stateChanges.failure_twist && (
                  <div
                    className="rounded-xl px-4 py-2.5"
                    style={{ border: "1px solid rgba(251,146,60,0.5)", background: "rgba(251,146,60,0.08)" }}
                  >
                    <p className="mb-1 text-xs font-semibold text-orange-400">⚡ 그러나...</p>
                    <p className="text-sm text-orange-200">{stateChanges.failure_twist}</p>
                  </div>
                )}
                <div className="h-px" style={{ background: "var(--skin-border)" }} />
              </motion.div>
            );
          }

          // ── NPC 대화 — 좌측 말풍선 ──
          if (log.speaker_type === "npc") {
            const stageDir = (log.state_changes as Record<string, unknown>)?.stage_direction as string | undefined;
            return (
              <motion.div key={log.id} {...msgAnim}
                className="flex items-start gap-2.5"
              >
                {/* NPC 아바타 */}
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-base"
                  style={{
                    border: "1.5px solid var(--skin-accent)",
                    background: "var(--skin-bg-secondary)",
                    boxShadow: "0 0 8px var(--skin-accent-glow)",
                  }}
                >
                  🗣
                </div>
                <div className="max-w-[78%]">
                  <p
                    className="mb-1.5 text-[11px] font-semibold tracking-wide"
                    style={{ color: "var(--skin-accent)", fontFamily: "var(--skin-font-display)" }}
                  >
                    {log.speaker_name}
                  </p>
                  {stageDir && (
                    <p className="mb-1 text-xs italic" style={{ color: "var(--skin-text-muted)" }}>
                      {stageDir}
                    </p>
                  )}
                  {log.content && (
                    <div
                      className="rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed"
                      style={{
                        background: "var(--skin-bg-secondary)",
                        border: "1px solid var(--skin-border)",
                        color: "var(--skin-text)",
                        fontFamily: "var(--skin-font-body)",
                      }}
                    >
                      {log.content}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          }

          // ── 플레이어 행동 — 우측 이탤릭 ──
          if (log.speaker_type === "player") {
            const diceRoll = (log.state_changes as { dice_roll?: DiceRoll }).dice_roll;
            const isMe = log.speaker_id === myPlayerId;
            return (
              <motion.div key={log.id} {...msgAnim}
                className="flex flex-col items-end"
              >
                <div className="max-w-[78%]">
                  <p className="mb-1.5 text-right text-[11px]" style={{ color: "var(--skin-text-muted)" }}>
                    {log.speaker_name}{isMe && " (나)"}
                  </p>
                  <div
                    className="rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm italic leading-relaxed"
                    style={{
                      background: isMe ? "var(--skin-accent-glow)" : "var(--skin-bg-secondary)",
                      border: `1px solid ${isMe ? "var(--skin-accent)" : "var(--skin-border)"}`,
                      color: "var(--skin-text)",
                      fontFamily: "var(--skin-font-body)",
                    }}
                  >
                    {log.content}
                  </div>
                  {diceRoll && <DiceRollCard dice={diceRoll} outcome={log.outcome} />}
                </div>
              </motion.div>
            );
          }

          // ── Lore 발견 ──
          if (log.action_type === "lore_discovery") {
            return (
              <motion.div key={log.id} {...msgAnim}
                className="w-full rounded-xl px-4 py-3.5"
                style={{
                  border: "1px solid var(--skin-accent)",
                  background: "var(--skin-accent-glow)",
                }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-lg">📜</span>
                  <p
                    className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: "var(--skin-accent)", fontFamily: "var(--skin-font-display)" }}
                  >
                    새로운 단서 발견
                  </p>
                  {log.is_private && (
                    <span
                      className="ml-auto rounded-full px-1.5 py-0.5 text-[10px]"
                      style={{ border: "1px solid var(--skin-border)", color: "var(--skin-text-muted)" }}
                    >
                      🔒 나만
                    </span>
                  )}
                </div>
                <div
                  className="rounded-lg px-3 py-2.5"
                  style={{ background: "var(--skin-bg-card)", border: "1px solid var(--skin-border)" }}
                >
                  <p className="whitespace-pre-line text-sm leading-relaxed" style={{ color: "var(--skin-text)" }}>
                    {log.content}
                  </p>
                </div>
              </motion.div>
            );
          }

          return null;
        })}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
