import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { generateChoices } from "@/lib/game/choice-generator";
import type { ActionChoice, RawPlayer } from "@/lib/types/game";
import type { PersonalityProfile } from "@/lib/types/character";

type PlayerWithPersonality = RawPlayer & { personality: PersonalityProfile | null };

const FALLBACK_CHOICES: ActionChoice[] = [
  {
    id: "f1",
    label: "신중하게 접근한다",
    description: "상황을 면밀히 살피며 조심스럽게 나아간다.",
    action_type: "choice",
  },
  {
    id: "f2",
    label: "대담하게 행동한다",
    description: "위험을 무릅쓰고 과감하게 돌파한다.",
    action_type: "choice",
  },
  {
    id: "f3",
    label: "상황을 관찰한다",
    description: "잠시 멈추고 주변을 살피며 정보를 모은다.",
    action_type: "choice",
  },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { session_id, player_id, local_id } = body as {
      session_id?: string;
      player_id?: string;
      local_id?: string;
    };

    if (!session_id || !player_id || !local_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 플레이어 조회 (user_id로 본인 확인, personality 컬럼 포함)
    const { data: player } = (await supabase
      .from("Player_Character")
      .select("*")
      .eq("id", player_id)
      .eq("user_id", local_id)
      .single()) as unknown as { data: PlayerWithPersonality | null; error: unknown };

    if (!player) {
      return NextResponse.json({ choices: FALLBACK_CHOICES });
    }

    // 최근 로그로 currentSituation 구성
    const { data: logs } = await supabase
      .from("Action_Log")
      .select("speaker_name, content")
      .eq("session_id", session_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const currentSituation =
      (logs ?? [])
        .reverse()
        .map((l) => `[${l.speaker_name}]: ${l.content}`)
        .join("\n") || "게임이 방금 시작되었습니다.";

    try {
      const choices = await generateChoices(
        player.personality ?? null,
        currentSituation,
        player.character_name
      );
      return NextResponse.json({ choices });
    } catch {
      return NextResponse.json({ choices: FALLBACK_CHOICES });
    }
  } catch {
    return NextResponse.json({ choices: FALLBACK_CHOICES });
  }
}
