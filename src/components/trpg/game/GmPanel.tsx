"use client";

import { useState } from "react";
import type { NpcPersona, QuestTracker } from "@/lib/trpg/types/game";
import type { NpcDynamicState } from "@/lib/trpg/types/character";

interface Props {
  sessionId: string;
  scenarioId: string;
  myPlayerId: string;
  npcs: NpcPersona[];
  dynamicStates: Record<string, NpcDynamicState> | null;
  questTracker: QuestTracker | null;
}

type Tab = "narrate" | "npc" | "doom" | "lore";

const NPC_STATE_OPTIONS: { field: string; label: string; min: number; max: number }[] = [
  { field: "affinity",        label: "호감도",     min: -100, max: 100 },
  { field: "trust",           label: "신뢰도",     min: -100, max: 100 },
  { field: "fear_survival",   label: "공포",       min: 0,    max: 100 },
  { field: "mental_stress",   label: "스트레스",   min: 0,    max: 100 },
  { field: "personal_debt",   label: "부채의식",   min: 0,    max: 100 },
  { field: "sense_of_duty",   label: "의무감",     min: 0,    max: 100 },
  { field: "camaraderie",     label: "전우애",     min: 0,    max: 100 },
];

export default function GmPanel({
  sessionId,
  scenarioId,
  myPlayerId,
  npcs,
  dynamicStates,
  questTracker,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("narrate");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [narrateText, setNarrateText] = useState("");
  const [selectedNpcId, setSelectedNpcId] = useState(npcs[0]?.id ?? "");
  const [selectedField, setSelectedField] = useState(NPC_STATE_OPTIONS[0].field);
  const [fieldValue, setFieldValue] = useState(0);
  const [loreText, setLoreText] = useState("");

  function showFeedback(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2500);
  }

  async function post(path: string, body: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, player_id: myPlayerId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "실패");
      return data;
    } finally {
      setLoading(false);
    }
  }

  async function patch(path: string, body: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, player_id: myPlayerId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "실패");
      return data;
    } finally {
      setLoading(false);
    }
  }

  async function handleNarrate() {
    if (!narrateText.trim()) return;
    try {
      await post("/api/trpg/game/gm/narrate", { content: narrateText });
      setNarrateText("");
      showFeedback("서술이 삽입됐습니다.");
    } catch (e) { showFeedback((e as Error).message); }
  }

  async function handleNpcState() {
    if (!selectedNpcId) return;
    const opt = NPC_STATE_OPTIONS.find((o) => o.field === selectedField);
    if (!opt) return;
    const clamped = Math.min(opt.max, Math.max(opt.min, fieldValue));
    try {
      await patch("/api/trpg/game/gm/npc-state", { npc_id: selectedNpcId, field: selectedField, value: clamped });
      showFeedback("NPC 상태가 변경됐습니다.");
    } catch (e) { showFeedback((e as Error).message); }
  }

  async function handleDoomClock(delta: number) {
    try {
      const data = await patch("/api/trpg/game/gm/doom-clock", { delta });
      showFeedback(`Doom Clock: ${data.doom_clock} / ${data.doom_clock_max}`);
    } catch (e) { showFeedback((e as Error).message); }
  }

  async function handleSkipTurn() {
    try {
      await post("/api/trpg/game/gm/skip-turn", {});
      showFeedback("턴을 건너뛰었습니다.");
    } catch (e) { showFeedback((e as Error).message); }
  }

  async function handleAddLore() {
    if (!loreText.trim()) return;
    try {
      await post("/api/trpg/game/gm/add-lore", { scenario_id: scenarioId, lore_text: loreText });
      setLoreText("");
      showFeedback("Lore가 추가됐습니다.");
    } catch (e) { showFeedback((e as Error).message); }
  }

  const currentNpcState = selectedNpcId ? (dynamicStates?.[selectedNpcId] as Record<string, unknown> | undefined) : undefined;
  const currentFieldVal = currentNpcState ? (currentNpcState[selectedField] as number | undefined) : undefined;

  const doom = questTracker?.doom_clock ?? 0;
  const doomMax = questTracker?.doom_clock_max ?? 10;

  const inputClass = "w-full rounded-lg px-3 py-1.5 text-xs outline-none";
  const inputStyle = {
    border: "1px solid var(--skin-border)",
    background: "var(--skin-bg-secondary)",
    color: "var(--skin-text)",
  };

  return (
    <div
      className="rounded-xl"
      style={{ border: "1px solid rgba(239,68,68,0.3)", background: "var(--skin-bg-card)" }}
    >
      {/* 헤더 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="text-base">🎲</span>
        <span className="flex-1 text-xs font-semibold" style={{ color: "#f87171" }}>GM 도구</span>
        <span className="text-xs" style={{ color: "var(--skin-text-muted)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--skin-border)" }}>
          {/* 탭 */}
          <div className="flex" style={{ borderBottom: "1px solid var(--skin-border)" }}>
            {([ ["narrate", "서술"], ["npc", "NPC"], ["doom", "운명"], ["lore", "Lore"] ] as [Tab, string][]).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-1.5 text-[11px] font-medium transition"
                style={
                  tab === t
                    ? { borderBottom: "2px solid #ef4444", color: "#f87171" }
                    : { color: "var(--skin-text-muted)" }
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-2 p-3">
            {/* ── 서술 주입 ── */}
            {tab === "narrate" && (
              <>
                <p className="text-[11px]" style={{ color: "var(--skin-text-muted)" }}>채팅에 GM 서술을 직접 삽입합니다.</p>
                <textarea
                  value={narrateText}
                  onChange={(e) => setNarrateText(e.target.value)}
                  rows={4}
                  placeholder="서술 내용을 입력하세요..."
                  className="w-full resize-none rounded-lg px-3 py-2 text-xs outline-none"
                  style={{ ...inputStyle, border: "1px solid var(--skin-border)" }}
                />
                <button
                  onClick={handleNarrate}
                  disabled={loading || !narrateText.trim()}
                  className="w-full rounded-lg py-2 text-xs font-semibold text-white transition disabled:opacity-40"
                  style={{ background: "#dc2626" }}
                >
                  {loading ? "처리 중…" : "서술 삽입"}
                </button>
                <button
                  onClick={handleSkipTurn}
                  disabled={loading}
                  className="w-full rounded-lg py-1.5 text-xs transition disabled:opacity-40"
                  style={{ border: "1px solid var(--skin-border)", color: "var(--skin-text-muted)" }}
                >
                  ⏩ 현재 턴 건너뜀
                </button>
              </>
            )}

            {/* ── NPC 심리 조정 ── */}
            {tab === "npc" && (
              <>
                <p className="text-[11px]" style={{ color: "var(--skin-text-muted)" }}>NPC 심리변수를 강제로 조정합니다.</p>
                {npcs.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--skin-text-muted)" }}>등록된 NPC가 없습니다.</p>
                ) : (
                  <>
                    <select
                      value={selectedNpcId}
                      onChange={(e) => setSelectedNpcId(e.target.value)}
                      className={inputClass}
                      style={inputStyle}
                    >
                      {npcs.map((n) => (
                        <option key={n.id} value={n.id}>{n.name} ({n.role})</option>
                      ))}
                    </select>

                    <select
                      value={selectedField}
                      onChange={(e) => {
                        setSelectedField(e.target.value);
                        const npcState = selectedNpcId ? (dynamicStates?.[selectedNpcId] as Record<string, unknown> | undefined) : undefined;
                        setFieldValue(npcState ? (npcState[e.target.value] as number | undefined) ?? 0 : 0);
                      }}
                      className={inputClass}
                      style={inputStyle}
                    >
                      {NPC_STATE_OPTIONS.map((o) => (
                        <option key={o.field} value={o.field}>{o.label} ({o.min}~{o.max})</option>
                      ))}
                    </select>

                    {currentFieldVal !== undefined && (
                      <p className="text-[11px]" style={{ color: "var(--skin-text-muted)" }}>현재값: {currentFieldVal}</p>
                    )}

                    <input
                      type="number"
                      value={fieldValue}
                      onChange={(e) => setFieldValue(Number(e.target.value))}
                      className={inputClass}
                      style={inputStyle}
                    />

                    <button
                      onClick={handleNpcState}
                      disabled={loading}
                      className="w-full rounded-lg py-2 text-xs font-semibold text-white transition disabled:opacity-40"
                      style={{ background: "#dc2626" }}
                    >
                      {loading ? "처리 중…" : "적용"}
                    </button>
                  </>
                )}
              </>
            )}

            {/* ── Doom Clock ── */}
            {tab === "doom" && (
              <>
                <p className="text-[11px]" style={{ color: "var(--skin-text-muted)" }}>운명의 시계를 수동으로 조작합니다.</p>
                <div
                  className="rounded-lg py-3 text-center"
                  style={{ border: "1px solid var(--skin-border)", background: "var(--skin-bg-secondary)" }}
                >
                  <p className="text-2xl font-black tabular-nums" style={{ color: "var(--skin-text)" }}>
                    {doom} <span className="text-sm font-normal" style={{ color: "var(--skin-text-muted)" }}>/ {doomMax}</span>
                  </p>
                  <p className="mt-1 text-[11px]" style={{ color: "var(--skin-text-muted)" }}>Doom Clock</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDoomClock(-1)}
                    disabled={loading || doom <= 0}
                    className="flex-1 rounded-lg py-2 text-sm font-bold transition disabled:opacity-40"
                    style={{ border: "1px solid var(--skin-border)", color: "var(--skin-text-muted)" }}
                  >
                    −1
                  </button>
                  <button
                    onClick={() => handleDoomClock(1)}
                    disabled={loading || doom >= doomMax}
                    className="flex-1 rounded-lg py-2 text-sm font-bold transition disabled:opacity-40"
                    style={{ border: "1px solid rgba(239,68,68,0.4)", color: "#f87171" }}
                  >
                    +1
                  </button>
                </div>
              </>
            )}

            {/* ── Lore 추가 ── */}
            {tab === "lore" && (
              <>
                <p className="text-[11px]" style={{ color: "var(--skin-text-muted)" }}>자연어로 입력하면 AI가 World Dictionary 형식으로 변환합니다.</p>
                <textarea
                  value={loreText}
                  onChange={(e) => setLoreText(e.target.value)}
                  rows={4}
                  placeholder="예: 마을 북쪽 숲에는 고대 제단이 있으며 보름달에 의식이 열린다..."
                  className="w-full resize-none rounded-lg px-3 py-2 text-xs outline-none"
                  style={inputStyle}
                />
                <button
                  onClick={handleAddLore}
                  disabled={loading || !loreText.trim()}
                  className="w-full rounded-lg py-2 text-xs font-semibold text-white transition disabled:opacity-40"
                  style={{ background: "#dc2626" }}
                >
                  {loading ? "AI 변환 중…" : "Lore 추가"}
                </button>
              </>
            )}

            {/* 피드백 */}
            {feedback && (
              <p
                className="rounded-lg px-3 py-1.5 text-center text-[11px]"
                style={{ background: "var(--skin-bg-secondary)", color: "var(--skin-text-muted)" }}
              >
                {feedback}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
