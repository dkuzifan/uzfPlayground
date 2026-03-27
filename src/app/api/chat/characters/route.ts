import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { AiCharacter, AiCharacterPublic } from "@/lib/chat/types";

// GET /api/chat/characters?local_id=xxx
export async function GET(req: NextRequest) {
  const localId = req.nextUrl.searchParams.get("local_id");
  if (!localId) return NextResponse.json({ error: "local_id required" }, { status: 400 });

  const supabase = createServiceClient();

  const [{ data: mine, error: e1 }, { data: pub, error: e2 }] = await Promise.all([
    supabase
      .from("AI_Character")
      .select("id, local_id, name, bio, personality, creator_bio, is_public, created_at")
      .eq("local_id", localId)
      .order("created_at", { ascending: false }),
    supabase
      .from("AI_Character")
      .select("id, local_id, name, bio, creator_bio, is_public, created_at")
      .eq("is_public", true)
      .neq("local_id", localId)
      .order("created_at", { ascending: false }),
  ]);

  if (e1) console.error("[GET /api/chat/characters] mine:", e1);
  if (e2) console.error("[GET /api/chat/characters] public:", e2);

  return NextResponse.json({
    mine: (mine ?? []) as AiCharacter[],
    public: (pub ?? []) as AiCharacterPublic[],
  });
}

// POST /api/chat/characters
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { local_id, name, bio, personality, creator_bio, is_public } = body;

  if (!local_id || !name?.trim() || !personality?.trim()) {
    return NextResponse.json({ error: "local_id, name, personality는 필수입니다" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("AI_Character")
    .insert({
      local_id,
      name: name.trim(),
      bio: bio?.trim() || null,
      personality: personality.trim(),
      creator_bio: creator_bio?.trim() || null,
      is_public: is_public ?? false,
    })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/chat/characters]", error);
    return NextResponse.json({ error: "캐릭터 생성에 실패했습니다" }, { status: 500 });
  }

  return NextResponse.json(data as AiCharacter, { status: 201 });
}
