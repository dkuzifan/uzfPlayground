import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// PATCH /api/chat/characters/[characterId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ characterId: string }> }
) {
  const { characterId } = await params;
  const body = await req.json();
  const { local_id, name, bio, personality, creator_bio, is_public } = body;

  if (!local_id) return NextResponse.json({ error: "local_id required" }, { status: 400 });

  const supabase = createServiceClient();

  // 소유 검증
  const { data: existing } = await supabase
    .from("AI_Character")
    .select("id, local_id")
    .eq("id", characterId)
    .single();

  if (!existing) return NextResponse.json({ error: "캐릭터를 찾을 수 없습니다" }, { status: 404 });
  if (existing.local_id !== local_id) return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });

  const updates: Record<string, unknown> = {};
  if (name?.trim()) updates.name = name.trim();
  if (bio !== undefined) updates.bio = bio?.trim() || null;
  if (personality?.trim()) updates.personality = personality.trim();
  if (creator_bio !== undefined) updates.creator_bio = creator_bio?.trim() || null;
  if (is_public !== undefined) updates.is_public = is_public;

  const { data, error } = await supabase
    .from("AI_Character")
    .update(updates)
    .eq("id", characterId)
    .select()
    .single();

  if (error) {
    console.error("[PATCH /api/chat/characters]", error);
    return NextResponse.json({ error: "수정에 실패했습니다" }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/chat/characters/[characterId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ characterId: string }> }
) {
  const { characterId } = await params;
  const body = await req.json();
  const { local_id } = body;

  if (!local_id) return NextResponse.json({ error: "local_id required" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("AI_Character")
    .select("id, local_id")
    .eq("id", characterId)
    .single();

  if (!existing) return NextResponse.json({ error: "캐릭터를 찾을 수 없습니다" }, { status: 404 });
  if (existing.local_id !== local_id) return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });

  const { error } = await supabase
    .from("AI_Character")
    .delete()
    .eq("id", characterId);

  if (error) {
    console.error("[DELETE /api/chat/characters]", error);
    return NextResponse.json({ error: "삭제에 실패했습니다" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
