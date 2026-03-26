import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export interface SavedCharacter {
  id: string;
  character_name: string;
  job: string;
  mbti: string | null;
  enneagram: number | null;
  dnd_alignment: string | null;
  personality_summary: string | null;
  session_id: string;
  created_at: string;
  scenario_title?: string;
}

// GET /api/trpg/characters — 내 캐릭터 목록 (최근 10개, 세션별 1개)
export async function GET() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("Player_Character")
    .select("id, character_name, job, mbti, enneagram, dnd_alignment, personality_summary, session_id, joined_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("joined_at", { ascending: false })
    .limit(20) as unknown as {
      data: {
        id: string;
        character_name: string;
        job: string;
        mbti: string | null;
        enneagram: number | null;
        dnd_alignment: string | null;
        personality_summary: string | null;
        session_id: string;
        joined_at: string;
      }[] | null;
      error: { message: string } | null;
    };

  if (error) return NextResponse.json({ error: "조회 실패" }, { status: 500 });

  const characters = data ?? [];

  // 세션별 가장 최근 1개만 남기기 (중복 세션 제거)
  const seen = new Set<string>();
  const deduped = characters.filter((c) => {
    const key = `${c.character_name}_${c.job}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({ characters: deduped.slice(0, 10) });
}
