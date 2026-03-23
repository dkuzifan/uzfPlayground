import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { normalizeStatSchema } from "@/lib/trpg/types/character";
import type { PersonalityProfile, CharacterJob } from "@/lib/trpg/types/character";

// ── 화이트리스트 검증 ──────────────────────────────────────────────────────────
const VALID_MBTI = new Set([
  "INTJ","INTP","ENTJ","ENTP",
  "INFJ","INFP","ENFJ","ENFP",
  "ISTJ","ISFJ","ESTJ","ESFJ",
  "ISTP","ISFP","ESTP","ESFP",
]);

const VALID_DND_ALIGNMENT = new Set([
  "lawful-good","neutral-good","chaotic-good",
  "lawful-neutral","true-neutral","chaotic-neutral",
  "lawful-evil","neutral-evil","chaotic-evil",
]);

const VALID_JOBS = new Set<CharacterJob>([
  "warrior","mage","rogue","cleric","ranger","paladin","bard",
]);

function validatePersonality(p: unknown): PersonalityProfile | null {
  if (!p || typeof p !== "object") return null;
  const obj = p as Record<string, unknown>;

  const mbti = obj.mbti === null ? null
    : (typeof obj.mbti === "string" && VALID_MBTI.has(obj.mbti)) ? obj.mbti
    : undefined;
  if (mbti === undefined) return null;

  const enneagram = obj.enneagram === null ? null
    : (typeof obj.enneagram === "number" && obj.enneagram >= 1 && obj.enneagram <= 9 && Number.isInteger(obj.enneagram)) ? obj.enneagram
    : undefined;
  if (enneagram === undefined) return null;

  const dnd_alignment = obj.dnd_alignment === null ? null
    : (typeof obj.dnd_alignment === "string" && VALID_DND_ALIGNMENT.has(obj.dnd_alignment)) ? obj.dnd_alignment
    : undefined;
  if (dnd_alignment === undefined) return null;

  const summary = typeof obj.summary === "string" ? obj.summary.slice(0, 200) : "";

  return { mbti, enneagram, dnd_alignment, summary } as PersonalityProfile;
}

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { sessionId } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { localId, nickname, avatarIndex, characterName, job, personality } = body as {
    localId?: string;
    nickname?: string;
    avatarIndex?: number;
    characterName?: string;
    job?: unknown;
    personality?: unknown;
  };

  if (!localId || !nickname?.trim()) {
    return NextResponse.json(
      { error: "localId와 nickname은 필수입니다." },
      { status: 400 }
    );
  }
  const safeAvatarIndex = Math.min(7, Math.max(0, avatarIndex ?? 0));

  // personality 검증
  const safePersonality = validatePersonality(personality);

  const supabase = createServiceClient();

  // 세션 존재 & waiting 상태 확인
  const { data: rawSession, error: sessionError } = await supabase
    .from("Game_Session")
    .select("id, max_players, status, scenario_id")
    .eq("id", sessionId)
    .single();

  if (sessionError || !rawSession) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
  }
  const session = rawSession as { id: string; max_players: number; status: string; scenario_id: string };
  if (session.status !== "waiting") {
    // 이미 시작된 방이라도 기존 멤버라면 200 OK (멱등적 처리)
    const { data: existing } = await supabase
      .from("Player_Character")
      .select("id")
      .eq("session_id", sessionId)
      .eq("user_id", localId)
      .single();
    if (existing) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "이미 시작된 방입니다." }, { status: 404 });
  }

  // 시나리오 character_config 조회 (직업별 기본 스탯)
  const { data: scenarioData } = await supabase
    .from("Scenario")
    .select("character_config")
    .eq("id", session.scenario_id)
    .single() as unknown as { data: { character_config: import("@/lib/trpg/types/game").CharacterConfig | null } | null };

  const characterConfig = scenarioData?.character_config ?? null;

  // job 검증 — character_config의 job 목록도 허용
  const configJobIds = new Set((characterConfig?.jobs ?? []).map((j) => j.id));
  const safeJob: string =
    typeof job === "string" && (VALID_JOBS.has(job as CharacterJob) || configJobIds.has(job))
      ? job
      : "adventurer";

  // 현재 인원 확인
  const { count } = await supabase
    .from("Player_Character")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if ((count ?? 0) >= session.max_players) {
    return NextResponse.json({ error: "방이 가득 찼습니다." }, { status: 409 });
  }

  // character_config 기반 기본 스탯 계산
  const configJob = characterConfig?.jobs?.find((j) => j.id === safeJob);
  let initialStats: Record<string, number>;
  if (configJob?.base_stats && Object.keys(configJob.base_stats).length > 0) {
    initialStats = configJob.base_stats;
  } else {
    const schema = normalizeStatSchema(characterConfig?.stat_schema);
    initialStats = {};
    for (const stat of schema) {
      const defaultVal = stat.display === "bar" ? 100 : 10;
      initialStats[stat.key] = defaultVal;
      if (stat.max_key) initialStats[stat.max_key] = defaultVal;
    }
    if (schema.length === 0) {
      initialStats = { hp: 100, max_hp: 100, attack: 10, defense: 8, speed: 10 };
    }
  }

  // INSERT — 같은 브라우저 새로고침 시 중복(23505)은 무시
  const { error: insertError } = await supabase
    .from("Player_Character")
    .insert({
      session_id: sessionId,
      user_id: localId,
      player_name: nickname.trim(),
      character_name: (characterName?.trim() || nickname.trim()).slice(0, 16),
      job: safeJob,
      stats: initialStats,
      personality_summary: `avatar:${safeAvatarIndex}`,
      ...(safePersonality?.mbti ? { mbti: safePersonality.mbti } : {}),
      ...(safePersonality?.enneagram != null ? { enneagram: safePersonality.enneagram } : {}),
      ...(safePersonality?.dnd_alignment ? { dnd_alignment: safePersonality.dnd_alignment } : {}),
    });

  if (insertError && insertError.code !== "23505") {
    return NextResponse.json({ error: "입장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
