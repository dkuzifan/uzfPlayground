import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { generatePortrait } from "@/lib/ai/vertex-imagen";

export async function POST(req: NextRequest) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { characterName, job, personalitySummary, theme, playerId, npcId } = body as {
    characterName: string;
    job: string;
    personalitySummary?: string;
    theme?: string;
    playerId?: string;
    npcId?: string;
  };

  if (!characterName || !job) {
    return NextResponse.json({ error: "characterName and job are required" }, { status: 400 });
  }

  const supabase = await createServiceClient();

  // 이미 초상화가 있으면 재생성 방지
  if (playerId) {
    const { data } = await supabase
      .from("Player_Character")
      .select("portrait_url")
      .eq("id", playerId)
      .single();
    if (data?.portrait_url) {
      return NextResponse.json({ url: data.portrait_url });
    }
  } else if (npcId) {
    const { data } = await supabase
      .from("NPC_Persona")
      .select("portrait_url")
      .eq("id", npcId)
      .single();
    if (data?.portrait_url) {
      return NextResponse.json({ url: data.portrait_url });
    }
  }

  try {
    const base64Image = await generatePortrait({ characterName, job, personalitySummary, theme });

    const fileName = `${playerId ?? npcId ?? `temp_${Date.now()}`}_${Date.now()}.png`;
    const imageBuffer = Buffer.from(base64Image, "base64");

    const { error: uploadError } = await supabase.storage
      .from("portraits")
      .upload(fileName, imageBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("[portrait] storage upload error:", uploadError);
      return NextResponse.json({
        url: null,
        base64: `data:image/png;base64,${base64Image}`,
      });
    }

    const { data: { publicUrl } } = supabase.storage.from("portraits").getPublicUrl(fileName);

    if (playerId) {
      await supabase
        .from("Player_Character")
        .update({ portrait_url: publicUrl })
        .eq("id", playerId);
    } else if (npcId) {
      await supabase
        .from("NPC_Persona")
        .update({ portrait_url: publicUrl })
        .eq("id", npcId);
    }

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    console.error("[portrait] generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Portrait generation failed" },
      { status: 500 }
    );
  }
}
