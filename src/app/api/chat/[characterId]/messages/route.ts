import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { generateChatReply } from "@/lib/chat/chat-agent";
import type { ChatMessage } from "@/lib/chat/types";

// GET /api/chat/[characterId]/messages?local_id=xxx
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ characterId: string }> }
) {
  const { characterId } = await params;
  const localId = req.nextUrl.searchParams.get("local_id");
  if (!localId) return NextResponse.json({ error: "local_id required" }, { status: 400 });

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("AI_Chat_Message")
    .select("id, character_id, local_id, role, content, emotion_state, created_at")
    .eq("character_id", characterId)
    .eq("local_id", localId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[GET /api/chat/messages]", error);
    return NextResponse.json({ error: "히스토리 조회 실패" }, { status: 500 });
  }

  return NextResponse.json({ messages: (data ?? []) as ChatMessage[] });
}

// POST /api/chat/[characterId]/messages
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ characterId: string }> }
) {
  const { characterId } = await params;
  const body = await req.json();
  const { local_id, content } = body;

  if (!local_id || !content?.trim()) {
    return NextResponse.json({ error: "local_id, content는 필수입니다" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 캐릭터 조회
  const { data: character } = await supabase
    .from("AI_Character")
    .select("id, personality, creator_bio")
    .eq("id", characterId)
    .single();

  if (!character) return NextResponse.json({ error: "캐릭터를 찾을 수 없습니다" }, { status: 404 });

  // 유저 메시지 저장
  await supabase.from("AI_Chat_Message").insert({
    character_id: characterId,
    local_id,
    role: "user",
    content: content.trim(),
  });

  // 컨텍스트 조회 (최근 20건)
  const { data: historyRows } = await supabase
    .from("AI_Chat_Message")
    .select("role, content")
    .eq("character_id", characterId)
    .eq("local_id", local_id)
    .order("created_at", { ascending: false })
    .limit(20);

  const history = (historyRows ?? []).reverse() as Pick<ChatMessage, "role" | "content">[];

  // AI 응답 생성
  const { reply, emotionState, innerMonologue } = await generateChatReply(
    character.personality,
    character.creator_bio ?? null,
    history.slice(0, -1), // 방금 저장한 유저 메시지 제외 (sendMessage로 전달)
    content.trim()
  );

  // AI 메시지 저장
  const { data: savedMsg, error: insertError } = await supabase
    .from("AI_Chat_Message")
    .insert({
      character_id: characterId,
      local_id,
      role: "assistant",
      content: reply,
      emotion_state: emotionState,
      inner_monologue: innerMonologue,
    })
    .select("id, created_at")
    .single();

  if (insertError) {
    console.error("[POST /api/chat/messages] AI 저장 실패:", insertError);
  }

  return NextResponse.json({
    id: savedMsg?.id ?? "",
    reply,
    emotion_state: emotionState,
    created_at: savedMsg?.created_at ?? new Date().toISOString(),
  });
}

// DELETE /api/chat/[characterId]/messages
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ characterId: string }> }
) {
  const { characterId } = await params;
  const body = await req.json();
  const { local_id } = body;

  if (!local_id) return NextResponse.json({ error: "local_id required" }, { status: 400 });

  const supabase = createServiceClient();

  const { error, count } = await supabase
    .from("AI_Chat_Message")
    .delete({ count: "exact" })
    .eq("character_id", characterId)
    .eq("local_id", local_id);

  if (error) {
    console.error("[DELETE /api/chat/messages]", error);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }

  return NextResponse.json({ deleted: count ?? 0 });
}
