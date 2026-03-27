import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getGeminiClient } from "@/lib/ai/gemini";

// POST /api/chat/characters/[characterId]/portrait
// mode: "url"      — body JSON { mode, url }
// mode: "generate" — body JSON { mode, personality }
// mode: "upload"   — FormData { mode, file }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ characterId: string }> }
) {
  const { characterId } = await params;
  const supabase = createServiceClient();
  const apiKey = process.env.GEMINI_API_KEY;

  let portraitUrl: string;

  const contentType = req.headers.get("content-type") ?? "";

  // ── 파일 업로드 ──────────────────────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${characterId}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from("chat-portraits")
      .upload(path, buffer, { contentType: file.type, upsert: true });

    if (upErr) {
      console.error("[portrait] storage upload error:", upErr);
      return NextResponse.json({ error: "업로드 실패" }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage
      .from("chat-portraits")
      .getPublicUrl(path);

    portraitUrl = publicUrl;

  } else {
    // ── JSON body ────────────────────────────────────────────────
    const body = await req.json();
    const { mode } = body;

    if (mode === "url") {
      // URL 직접 저장
      if (!body.url) return NextResponse.json({ error: "url required" }, { status: 400 });
      portraitUrl = body.url;

    } else if (mode === "generate") {
      // Imagen으로 AI 생성
      if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 });

      // 1) Gemini로 영문 이미지 프롬프트 생성
      const geminiModel = getGeminiClient().getGenerativeModel({ model: "gemini-2.5-flash" });
      const promptRes = await geminiModel.generateContent(
        `다음 캐릭터 설명을 바탕으로, Imagen 이미지 생성용 영어 프롬프트를 한 문장으로 만들어줘.
캐릭터 외모·분위기·스타일을 묘사하는 portrait 프롬프트여야 해. 스타일은 "anime-style portrait"을 기본으로 해.
캐릭터 설명: ${body.personality}
프롬프트만 출력 (다른 텍스트 없이).`
      );
      const imagePrompt = promptRes.response.text().trim();

      // 2) Imagen 3로 이미지 생성
      const imagenRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instances: [{ prompt: imagePrompt }],
            parameters: { sampleCount: 1, aspectRatio: "1:1" },
          }),
        }
      );

      if (!imagenRes.ok) {
        const err = await imagenRes.text();
        console.error("[portrait] Imagen error:", err);
        return NextResponse.json({ error: "이미지 생성 실패", detail: err }, { status: 500 });
      }

      const imagenData = await imagenRes.json();
      const b64 = imagenData?.predictions?.[0]?.bytesBase64Encoded;
      if (!b64) return NextResponse.json({ error: "이미지 생성 결과 없음" }, { status: 500 });

      // 3) Supabase Storage에 업로드
      const path = `${characterId}/${Date.now()}.jpg`;
      const buffer = Buffer.from(b64, "base64");

      const { error: upErr } = await supabase.storage
        .from("chat-portraits")
        .upload(path, buffer, { contentType: "image/jpeg", upsert: true });

      if (upErr) {
        console.error("[portrait] storage upload error:", upErr);
        return NextResponse.json({ error: "스토리지 저장 실패" }, { status: 500 });
      }

      const { data: { publicUrl } } = supabase.storage
        .from("chat-portraits")
        .getPublicUrl(path);

      portraitUrl = publicUrl;

    } else {
      return NextResponse.json({ error: "invalid mode" }, { status: 400 });
    }
  }

  // ── portrait_url을 AI_Character에 저장 ───────────────────────
  const { error: updateErr } = await supabase
    .from("AI_Character")
    .update({ portrait_url: portraitUrl })
    .eq("id", characterId);

  if (updateErr) {
    console.error("[portrait] update error:", updateErr);
    return NextResponse.json({ error: "캐릭터 업데이트 실패" }, { status: 500 });
  }

  return NextResponse.json({ portrait_url: portraitUrl });
}
