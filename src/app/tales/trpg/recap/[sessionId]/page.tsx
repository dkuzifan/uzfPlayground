import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { QuestTracker, ScenarioObjectives, ScenarioEndings, EndingCondition } from "@/lib/trpg/types/game";
import type { NpcDynamicState, CharacterStats, PersonalityProfile } from "@/lib/trpg/types/character";

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

// ── 색상 헬퍼 ────────────────────────────────────────────────────────────────

function toneStyle(tone: string) {
  switch (tone) {
    case "triumphant": return { border: "border-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-900/20", text: "text-yellow-700 dark:text-yellow-300", badge: "bg-yellow-400 text-yellow-900" };
    case "bittersweet": return { border: "border-purple-400", bg: "bg-purple-50 dark:bg-purple-900/20", text: "text-purple-700 dark:text-purple-300", badge: "bg-purple-400 text-white" };
    case "tragic": return { border: "border-red-400", bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-700 dark:text-red-300", badge: "bg-red-500 text-white" };
    case "mysterious": return { border: "border-teal-400", bg: "bg-teal-50 dark:bg-teal-900/20", text: "text-teal-700 dark:text-teal-300", badge: "bg-teal-500 text-white" };
    default: return { border: "border-neutral-300", bg: "bg-neutral-50 dark:bg-neutral-800", text: "text-neutral-700 dark:text-neutral-300", badge: "bg-neutral-400 text-white" };
  }
}

function toneLabel(tone: string) {
  const map: Record<string, string> = { triumphant: "승리", bittersweet: "씁쓸한 승리", tragic: "비극", mysterious: "미스터리" };
  return map[tone] ?? tone;
}

function outcomeLabel(outcome: string | null) {
  const map: Record<string, string> = { great_success: "대성공", success: "성공", failure: "실패" };
  return outcome ? (map[outcome] ?? outcome) : null;
}

function outcomeColor(outcome: string | null) {
  if (outcome === "great_success") return "text-yellow-600 dark:text-yellow-400";
  if (outcome === "success") return "text-emerald-600 dark:text-emerald-400";
  if (outcome === "failure") return "text-red-500 dark:text-red-400";
  return "text-neutral-400";
}

function roleLabel(role: string) {
  const map: Record<string, string> = { ally: "우호", neutral: "중립", enemy: "적대", boss: "보스" };
  return map[role] ?? role;
}

function roleColor(role: string) {
  if (role === "ally") return "text-emerald-600 dark:text-emerald-400";
  if (role === "boss") return "text-red-600 dark:text-red-400";
  if (role === "enemy") return "text-orange-600 dark:text-orange-400";
  return "text-neutral-500";
}

function affinityBar(value: number) {
  const pct = Math.round(((value + 100) / 200) * 100);
  const color = value >= 50 ? "bg-emerald-400" : value >= 0 ? "bg-neutral-400" : "bg-red-400";
  return { pct, color };
}

function statBar(value: number, max = 100) {
  const pct = Math.round((value / max) * 100);
  const color = value >= 70 ? "bg-red-400" : value >= 40 ? "bg-yellow-400" : "bg-teal-400";
  return { pct, color };
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  } catch { return iso; }
}

// ── 데이터 타입 ───────────────────────────────────────────────────────────────

interface RecapData {
  session: {
    id: string;
    status: string;
    turn_number: number;
    created_at: string;
    updated_at: string;
    quest_tracker: QuestTracker | null;
    npc_dynamic_states: Record<string, NpcDynamicState>;
    scene_phase: string | null;
  };
  scenario: {
    title: string;
    theme: string;
    description: string | null;
    objectives: ScenarioObjectives | null;
    endings: ScenarioEndings | null;
  };
  players: {
    id: string;
    player_name: string;
    character_name: string;
    job: string;
    stats: CharacterStats;
    personality: PersonalityProfile;
  }[];
  npcs: {
    id: string;
    name: string;
    role: string;
    appearance: string;
    personality: string;
  }[];
  keyMoments: {
    id: string;
    turn_number: number;
    speaker_name: string;
    speaker_type: string;
    action_type: string;
    content: string;
    outcome: string | null;
  }[];
  globalMemory: {
    summary_text: string;
    emotional_tags: Record<string, number>;
  } | null;
}

// ── 서버사이드 데이터 패치 ────────────────────────────────────────────────────

async function fetchRecap(sessionId: string): Promise<RecapData | null> {
  const supabase = createServiceClient();

  const { data: session } = await supabase
    .from("Game_Session")
    .select("id, status, turn_number, created_at, updated_at, scenario_id, quest_tracker, npc_dynamic_states, scene_phase")
    .eq("id", sessionId)
    .single() as unknown as { data: RecapData["session"] & { scenario_id: string } | null };

  if (!session) return null;

  const [scenarioRes, playersRes, npcsRes, momentRes, loreRes, memRes] = await Promise.all([
    supabase.from("Scenario").select("title, theme, description, objectives, endings").eq("id", session.scenario_id).single() as unknown as { data: RecapData["scenario"] | null },
    supabase.from("Player_Character").select("id, player_name, character_name, job, stats, personality").eq("session_id", sessionId).eq("is_active", true) as unknown as { data: RecapData["players"] | null },
    supabase.from("NPC_Persona").select("id, name, role, appearance, personality").eq("scenario_id", session.scenario_id).eq("is_introduced", true) as unknown as { data: RecapData["npcs"] | null },
    supabase.from("Action_Log").select("id, turn_number, speaker_name, speaker_type, action_type, content, outcome").eq("session_id", sessionId).eq("is_private", false).in("action_type", ["choice", "free_input", "gm_narration", "system_event"]).not("outcome", "is", null).order("turn_number").limit(15) as unknown as { data: RecapData["keyMoments"] | null },
    supabase.from("Action_Log").select("id, turn_number, speaker_name, speaker_type, action_type, content, outcome").eq("session_id", sessionId).eq("is_private", false).eq("action_type", "lore_discovery").order("turn_number").limit(5) as unknown as { data: RecapData["keyMoments"] | null },
    supabase.from("Session_Memory").select("summary_text, emotional_tags").eq("session_id", sessionId).is("npc_id", null).order("created_at", { ascending: false }).limit(1).single() as unknown as { data: RecapData["globalMemory"] | null },
  ]);

  const allMoments = [...(momentRes.data ?? []), ...(loreRes.data ?? [])].sort((a, b) => a.turn_number - b.turn_number).slice(0, 20);

  return {
    session: { ...session, npc_dynamic_states: session.npc_dynamic_states ?? {} },
    scenario: scenarioRes.data ?? { title: "알 수 없는 시나리오", theme: "mystery", description: null, objectives: null, endings: null },
    players: playersRes.data ?? [],
    npcs: npcsRes.data ?? [],
    keyMoments: allMoments,
    globalMemory: memRes.data ?? null,
  };
}

// ── 메인 페이지 컴포넌트 ─────────────────────────────────────────────────────

export default async function RecapPage({ params }: PageProps) {
  const { sessionId } = await params;
  const recap = await fetchRecap(sessionId);

  if (!recap) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-neutral-500">세션을 찾을 수 없습니다.</p>
          <Link href="/tales/trpg/lobby" className="text-sm text-teal-500 underline">로비로 돌아가기</Link>
        </div>
      </div>
    );
  }

  const { session, scenario, players, npcs, keyMoments, globalMemory } = recap;
  const qt = session.quest_tracker;

  // 달성 엔딩 찾기
  const achievedEnding: EndingCondition | null = qt?.ending_id && scenario.endings
    ? (scenario.endings.endings.find((e) => e.id === qt.ending_id) ?? null)
    : null;

  const endingStyle = achievedEnding ? toneStyle(achievedEnding.tone) : toneStyle("none");

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* 헤더 */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Link href="/tales/trpg/lobby" className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">← 로비</Link>
            <span className="text-xs text-neutral-300 dark:text-neutral-600">/</span>
            <span className="text-xs text-neutral-400">세션 리캡</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{scenario.title}</h1>
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span className="rounded bg-neutral-200 px-1.5 py-0.5 dark:bg-neutral-800">{scenario.theme}</span>
            <span>·</span>
            <span>총 {session.turn_number}턴</span>
            <span>·</span>
            <span>{formatDate(session.created_at)}</span>
            <span>·</span>
            <span className={session.status === "completed" ? "text-emerald-500" : "text-orange-400"}>
              {session.status === "completed" ? "완료" : session.status === "abandoned" ? "중단" : session.status}
            </span>
          </div>
        </div>

        {/* 엔딩 카드 */}
        {achievedEnding ? (
          <div className={`rounded-2xl border-2 p-5 ${endingStyle.border} ${endingStyle.bg}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-2xl">
                {achievedEnding.tone === "triumphant" ? "🏆" : achievedEnding.tone === "bittersweet" ? "🌙" : achievedEnding.tone === "tragic" ? "💀" : "🔮"}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${endingStyle.badge}`}>
                {toneLabel(achievedEnding.tone)}
              </span>
              <span className={`text-sm font-semibold ${endingStyle.text}`}>{achievedEnding.label}</span>
            </div>
            <p className={`text-sm leading-relaxed ${endingStyle.text}`}>{achievedEnding.description}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-sm text-neutral-400">엔딩 미달성 — 세션이 중단되었거나 엔딩 데이터가 없습니다.</p>
          </div>
        )}

        {/* 목표 + 플레이어 */}
        <div className="grid gap-4 sm:grid-cols-2">

          {/* 목표 카드 */}
          <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-300">목표 달성 현황</h2>
            {qt && scenario.objectives ? (
              <div className="space-y-3">
                {/* 메인 목표 */}
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-neutral-600 dark:text-neutral-400">메인 목표</span>
                    <span className="text-neutral-400">{qt.primary_progress}/{scenario.objectives.primary.progress_max}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div
                      className="h-2 rounded-full bg-teal-500 transition-all"
                      style={{ width: `${Math.min(100, Math.round((qt.primary_progress / Math.max(1, scenario.objectives.primary.progress_max)) * 100))}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-400 truncate">{scenario.objectives.primary.target_description}</p>
                </div>

                {/* 서브 목표 */}
                {scenario.objectives.secondary?.map((sec, i) => (
                  <div key={i}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-neutral-500 dark:text-neutral-400">서브 {i + 1}</span>
                      <span className="text-neutral-400">{qt.secondary_progress[i] ?? 0}/{sec.progress_max}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-800">
                      <div
                        className="h-1.5 rounded-full bg-indigo-400 transition-all"
                        style={{ width: `${Math.min(100, Math.round(((qt.secondary_progress[i] ?? 0) / Math.max(1, sec.progress_max)) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}

                {/* 비밀 목표 */}
                {scenario.objectives.secret && (
                  <div className="flex items-center gap-2">
                    <span className={`text-lg ${qt.secret_triggered ? "opacity-100" : "opacity-30"}`}>🔮</span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      비밀 목표 — {qt.secret_triggered ? "달성" : "미달성"}
                    </span>
                  </div>
                )}

                {/* 둠 클락 */}
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-red-500 dark:text-red-400">둠 클락</span>
                    <span className="text-neutral-400">{qt.doom_clock}/{qt.doom_clock_max}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div
                      className="h-1.5 rounded-full bg-red-400 transition-all"
                      style={{ width: `${Math.min(100, Math.round((qt.doom_clock / Math.max(1, qt.doom_clock_max)) * 100))}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-neutral-400">목표 데이터 없음</p>
            )}
          </div>

          {/* 플레이어 카드 */}
          <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-300">플레이어 캐릭터</h2>
            {players.length > 0 ? (
              <div className="space-y-3">
                {players.map((p) => {
                  const hp = p.stats?.hp ?? 0;
                  const maxHp = p.stats?.max_hp ?? 30;
                  const hpPct = Math.round((hp / Math.max(1, maxHp)) * 100);
                  const hpColor = hpPct > 60 ? "bg-emerald-400" : hpPct > 30 ? "bg-yellow-400" : "bg-red-400";
                  return (
                    <div key={p.id} className="rounded-lg bg-neutral-50 p-2.5 dark:bg-neutral-800/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{p.character_name}</span>
                          <span className="ml-1.5 text-xs text-neutral-400">({p.player_name})</span>
                        </div>
                        <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs dark:bg-neutral-700 dark:text-neutral-300">{p.job}</span>
                      </div>
                      <div className="mt-1.5">
                        <div className="mb-0.5 flex items-center justify-between text-xs">
                          <span className="text-neutral-400">HP</span>
                          <span className="text-neutral-400">{hp}/{maxHp}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700">
                          <div className={`h-1.5 rounded-full ${hpColor}`} style={{ width: `${hpPct}%` }} />
                        </div>
                      </div>
                      {p.personality?.mbti && (
                        <p className="mt-1 text-xs text-neutral-400">{p.personality.mbti} · {p.personality.dnd_alignment ?? ""}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-neutral-400">플레이어 데이터 없음</p>
            )}
          </div>
        </div>

        {/* NPC 관계 */}
        {npcs.length > 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-300">NPC 최종 관계</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {npcs.map((npc) => {
                const state = session.npc_dynamic_states[npc.id];
                const affinity = state?.affinity ?? 0;
                const fear = state?.fear_survival ?? 0;
                const trust = state?.trust ?? 0;
                const { pct: affinityPct, color: affinityColor } = affinityBar(affinity);
                const { pct: fearPct, color: fearColor } = statBar(fear);
                return (
                  <div key={npc.id} className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/50">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{npc.name}</span>
                      <span className={`text-xs font-medium ${roleColor(npc.role)}`}>{roleLabel(npc.role)}</span>
                    </div>
                    {state ? (
                      <div className="space-y-1.5">
                        {/* 호감도 */}
                        <div>
                          <div className="flex justify-between text-xs text-neutral-400 mb-0.5">
                            <span>호감도</span><span>{affinity > 0 ? "+" : ""}{affinity}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700">
                            <div className={`h-1.5 rounded-full ${affinityColor}`} style={{ width: `${affinityPct}%` }} />
                          </div>
                        </div>
                        {/* 신뢰 */}
                        <div>
                          <div className="flex justify-between text-xs text-neutral-400 mb-0.5">
                            <span>신뢰</span><span>{trust > 0 ? "+" : ""}{trust}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700">
                            <div className={`h-1.5 rounded-full bg-blue-400`} style={{ width: `${Math.round(((trust + 100) / 200) * 100)}%` }} />
                          </div>
                        </div>
                        {/* 공포 */}
                        <div>
                          <div className="flex justify-between text-xs text-neutral-400 mb-0.5">
                            <span>공포</span><span>{fear}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700">
                            <div className={`h-1.5 rounded-full ${fearColor}`} style={{ width: `${fearPct}%` }} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-400">상태 데이터 없음</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 핵심 장면 타임라인 */}
        {keyMoments.length > 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-300">핵심 장면</h2>
            <div className="relative space-y-3 pl-5">
              <div className="absolute left-1.5 top-2 bottom-2 w-px bg-neutral-200 dark:bg-neutral-700" />
              {keyMoments.map((m) => {
                const label = outcomeLabel(m.outcome);
                const color = outcomeColor(m.outcome);
                const isLore = m.action_type === "lore_discovery";
                return (
                  <div key={m.id} className="relative">
                    <div className={`absolute -left-3.5 top-1 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-neutral-900 ${isLore ? "bg-teal-400" : m.outcome === "great_success" ? "bg-yellow-400" : m.outcome === "failure" ? "bg-red-400" : "bg-emerald-400"}`} />
                    <div className="rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-800/50">
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <span className="text-xs text-neutral-400">턴 {m.turn_number}</span>
                        <span className="text-xs text-neutral-300 dark:text-neutral-600">·</span>
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">{m.speaker_name}</span>
                        {label && <span className={`ml-auto text-xs font-semibold ${color}`}>{label}</span>}
                        {isLore && <span className="ml-auto text-xs font-semibold text-teal-500">📜 단서</span>}
                      </div>
                      <p className="text-xs text-neutral-600 dark:text-neutral-300 line-clamp-2">{m.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 세션 메모리 요약 */}
        {globalMemory && (
          <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">세션 기억 요약</h2>
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{globalMemory.summary_text}</p>
            {globalMemory.emotional_tags && Object.keys(globalMemory.emotional_tags).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(globalMemory.emotional_tags)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 6)
                  .map(([tag]) => (
                    <span key={tag} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                      {tag}
                    </span>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* 하단 링크 */}
        <div className="pb-8 text-center">
          <Link href="/tales/trpg/lobby" className="text-sm text-teal-500 hover:underline">로비로 돌아가기</Link>
        </div>

      </div>
    </div>
  );
}
