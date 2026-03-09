import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { PersonalityProfile, CharacterJob } from "@/lib/types/character";

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

  // job 검증
  const safeJob: CharacterJob =
    typeof job === "string" && VALID_JOBS.has(job as CharacterJob)
      ? (job as CharacterJob)
      : "adventurer";

  // personality 검증
  const safePersonality = validatePersonality(personality);

  const supabase = createServiceClient();

  // 세션 존재 & waiting 상태 확인
  const { data: rawSession, error: sessionError } = await supabase
    .from("Game_Session")
    .select("id, max_players, status")
    .eq("id", sessionId)
    .single();

  if (sessionError || !rawSession) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
  }
  const session = rawSession as { id: string; max_players: number; status: string };
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

  // 현재 인원 확인
  const { count } = await supabase
    .from("Player_Character")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if ((count ?? 0) >= session.max_players) {
    return NextResponse.json({ error: "방이 가득 찼습니다." }, { status: 409 });
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
      personality_summary: `avatar:${safeAvatarIndex}`,
      ...(safePersonality ? { personality: safePersonality } : {}),
    });

  if (insertError && insertError.code !== "23505") {
    return NextResponse.json({ error: "입장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
