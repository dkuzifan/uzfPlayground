import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// DELETE /api/trpg/characters/[id] — 내 캐릭터 삭제
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();

  // 소유권 확인
  const { data: pc } = await supabase
    .from("Player_Character")
    .select("id, user_id")
    .eq("id", id)
    .single() as unknown as { data: { id: string; user_id: string } | null };

  if (!pc) return NextResponse.json({ error: "캐릭터를 찾을 수 없습니다." }, { status: 404 });
  if (pc.user_id !== user.id) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const { error } = await supabase
    .from("Player_Character")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return NextResponse.json({ error: "삭제 실패" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
