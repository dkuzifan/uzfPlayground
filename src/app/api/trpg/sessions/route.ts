import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// ── GET /api/trpg/sessions — 대기 중인 방 목록 ──────────────────────
export async function GET() {
  const supabase = createServiceClient();

  type RawSession = {
    id: string;
    room_name: string;
    max_players: number;
    Scenario: { title: string } | null;
    Player_Character: { count: number }[];
  };

  const { data: rawSessions, error } = await supabase
    .from("Game_Session")
    .select(
      `id, room_name, max_players,
       Scenario(title),
       Player_Character(count)`
    )
    .eq("status", "waiting")
    .order("created_at", { ascending: false }) as unknown as {
    data: RawSession[] | null;
    error: { message: string } | null;
  };

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = (rawSessions ?? []).map((s) => ({
    id: s.id,
    room_name: s.room_name,
    max_players: s.max_players,
    player_count: s.Player_Character?.[0]?.count ?? 0,
    scenario_title: s.Scenario?.title ?? "",
  }));

  return NextResponse.json(result);
}

const VALID_JOBS_SET = new Set([
  "warrior","mage","rogue","cleric","ranger","paladin","bard","adventurer",
]);

// ── POST /api/trpg/sessions — 방 생성 ───────────────────────────────
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { room_name, max_players, scenario_id, localId, nickname, avatarIndex, characterName, job, personality } = body as {
    room_name?: string;
    max_players?: number;
    scenario_id?: string;
    localId?: string;
    nickname?: string;
    avatarIndex?: number;
    characterName?: string;
    job?: string;
    personality?: { mbti?: string | null; enneagram?: number | null; dnd_alignment?: string | null };
  };

  // 입력 검증
  if (!room_name?.trim() || room_name.trim().length > 20) {
    return NextResponse.json(
      { error: "room_name은 1~20자 필수입니다." },
      { status: 400 }
    );
  }
  if (!localId || !nickname?.trim()) {
    return NextResponse.json(
      { error: "localId와 nickname은 필수입니다." },
      { status: 400 }
    );
  }
  if (!scenario_id) {
    return NextResponse.json(
      { error: "scenario_id는 필수입니다." },
      { status: 400 }
    );
  }
  const safeMaxPlayers = Math.min(7, Math.max(2, max_players ?? 4));
  const safeAvatarIndex = Math.min(7, Math.max(0, avatarIndex ?? 0));
  const safeJob = typeof job === "string" && VALID_JOBS_SET.has(job) ? job : "adventurer";
  const safeCharName = (characterName?.trim() || nickname.trim()).slice(0, 16);

  const supabase = createServiceClient();

  // Step 1: 시나리오 존재 확인
  const { data: scenario, error: scenarioError } = await supabase
    .from("Scenario")
    .select("id")
    .eq("id", scenario_id)
    .eq("is_active", true)
    .single();

  if (scenarioError || !scenario) {
    return NextResponse.json(
      { error: "유효한 시나리오를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  // Step 2: Game_Session 생성
  const { data: session, error: sessionError } = await supabase
    .from("Game_Session")
    .insert({
      scenario_id: scenario.id,
      room_name: room_name.trim(),
      max_players: safeMaxPlayers,
      status: "waiting",
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    console.error("[sessions POST] Game_Session insert error:", sessionError);
    return NextResponse.json(
      { error: "방 생성에 실패했습니다.", detail: sessionError?.message },
      { status: 500 }
    );
  }

  // Step 3: 방장 Player_Character 생성
  const { data: pc, error: pcError } = await supabase
    .from("Player_Character")
    .insert({
      session_id: session.id,
      user_id: localId,
      player_name: nickname.trim(),
      character_name: safeCharName,
      job: safeJob,
      personality_summary: `avatar:${safeAvatarIndex}`,
      ...(personality?.mbti ? { mbti: personality.mbti } : {}),
      ...(personality?.enneagram != null ? { enneagram: personality.enneagram } : {}),
      ...(personality?.dnd_alignment ? { dnd_alignment: personality.dnd_alignment } : {}),
    })
    .select("id")
    .single();

  if (pcError || !pc) {
    console.error("[sessions POST] Player_Character insert error:", pcError);
    return NextResponse.json(
      { error: "플레이어 등록에 실패했습니다.", detail: pcError?.message },
      { status: 500 }
    );
  }

  // Step 4: host_player_id 업데이트
  await supabase
    .from("Game_Session")
    .update({ host_player_id: pc.id })
    .eq("id", session.id);

  return NextResponse.json({ sessionId: session.id });
}
