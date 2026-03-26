import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getGeminiModel } from "@/lib/ai/gemini";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { session_id, scenario_id, player_id, lore_text } = body as {
      session_id?: string;
      scenario_id?: string;
      player_id?: string;
      lore_text?: string;
    };

    if (!session_id || !scenario_id || !player_id || !lore_text?.trim()) {
      return NextResponse.json({ error: "필수 파라미터가 누락됐습니다." }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: session } = await supabase
      .from("Game_Session")
      .select("host_player_id")
      .eq("id", session_id)
      .single() as unknown as { data: { host_player_id: string | null } | null };

    if (!session || session.host_player_id !== player_id) {
      return NextResponse.json({ error: "호스트만 사용할 수 있습니다." }, { status: 403 });
    }

    // AI로 구조화된 Lore 항목 생성
    const model = getGeminiModel("gemini-2.5-pro");
    const prompt = `아래 텍스트를 TRPG World Dictionary Lore 항목으로 변환하세요.

입력: "${lore_text.trim()}"

JSON만 반환 (코드블록 없이):
{
  "domain": "WORLD_LORE 또는 PERSONAL_LORE",
  "category": "역사|장소|인물|사건|규칙|기타 중 하나",
  "lore_text": "150자 이내로 정제된 원문",
  "trigger_keywords": ["핵심 키워드 2~4개"],
  "cluster_tags": ["주제 태그 1~2개"],
  "importance_weight": 5~9 사이 정수,
  "required_access_level": 1~3 사이 정수
}`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned) as {
      domain: "WORLD_LORE" | "PERSONAL_LORE";
      category: string;
      lore_text: string;
      trigger_keywords: string[];
      cluster_tags: string[];
      importance_weight: number;
      required_access_level: number;
    };

    const { data, error } = await supabase
      .from("World_Dictionary")
      .insert({
        scenario_id,
        domain: parsed.domain,
        category: parsed.category,
        lore_text: parsed.lore_text.slice(0, 500),
        trigger_keywords: parsed.trigger_keywords,
        cluster_tags: parsed.cluster_tags,
        importance_weight: Math.min(10, Math.max(1, parsed.importance_weight)),
        required_access_level: Math.min(10, Math.max(1, parsed.required_access_level)),
      })
      .select("id, domain, category, lore_text, trigger_keywords")
      .single();

    if (error) {
      console.error("[gm/add-lore]", error);
      return NextResponse.json({ error: "Lore 저장에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, lore: data });
  } catch (err) {
    console.error("[gm/add-lore]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
