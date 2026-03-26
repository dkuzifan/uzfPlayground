import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

// ── GET /api/trpg/sessions/[sessionId]/my-character ──────────────────────────
// 해당 세션에 이미 내 Player_Character가 있는지 확인.
// - exists: true  → 이미 참여 중, 바로 대기실로 이동
// - exists: false → 캐릭터 생성 필요, scenario 정보 반환
export async function GET(request: Request, { params }: RouteParams) {
  const { sessionId } = await params;

  // 서버사이드 인증
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  // 하위호환: auth 없으면 query param localId 사용
  let userId = user?.id ?? null;
  if (!userId) {
    const { searchParams } = new URL(request.url);
    userId = searchParams.get("localId");
  }

  if (!userId) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const supabase = createServiceClient();

  // 내 PC 존재 여부 확인
  const { data: pc } = await supabase
    .from("Player_Character")
    .select("id")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .single();

  if (pc) {
    return NextResponse.json({ exists: true });
  }

  // PC 없음 → 시나리오 config 포함해서 반환 (캐릭터 생성 UI에 필요)
  type SessionWithScenario = {
    id: string;
    status: string;
    max_players: number;
    Scenario: {
      id: string;
      title: string;
      theme: string;
      character_creation_config: {
        available_jobs: string[];
        job_labels: Record<string, string>;
        personality_test_theme: string;
        character_name_hint: string;
      };
    } | null;
  };

  const { data: session, error } = await supabase
    .from("Game_Session")
    .select("id, status, max_players, Scenario(id, title, theme, character_creation_config)")
    .eq("id", sessionId)
    .single() as unknown as { data: SessionWithScenario | null; error: unknown };

  if (error || !session) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
  }

  if (session.status !== "waiting") {
    return NextResponse.json({ error: "이미 시작된 방입니다." }, { status: 409 });
  }

  return NextResponse.json({
    exists: false,
    scenario: session.Scenario,
    max_players: session.max_players,
  });
}
