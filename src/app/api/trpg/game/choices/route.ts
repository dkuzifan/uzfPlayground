import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { generateChoices } from "@/lib/game/choice-generator";
import { computeDCFromCategory, defaultResistanceStats } from "@/lib/game/dc-calculator";
import type { ActionChoice, RawPlayer, NpcPersona } from "@/lib/types/game";
import type { PersonalityProfile, ResistanceStats } from "@/lib/types/character";
import type { ActionCategory } from "@/lib/game/dc-calculator";

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

    // 최근 로그 + 세션 NPC 조회 병렬 실행
    const [{ data: logs }, { data: npcsData }] = await Promise.all([
      supabase
        .from("Action_Log")
        .select("speaker_name, content")
        .eq("session_id", session_id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("NPC_Persona")
        .select("id, resistance_stats")
        .eq("session_id", session_id)
        .limit(1),
    ]);

    const currentSituation =
      (logs ?? [])
        .reverse()
        .map((l) => `[${l.speaker_name}]: ${l.content}`)
        .join("\n") || "게임이 방금 시작되었습니다.";

    // 판정 DC 계산 기준 NPC의 저항 스탯 (없으면 기본값)
    const primaryNpc = ((npcsData ?? []) as unknown as NpcPersona[])[0] ?? null;
    const resistance: ResistanceStats =
      (primaryNpc?.resistance_stats as ResistanceStats | undefined) ?? defaultResistanceStats();

    try {
      const rawChoices = await generateChoices(
        player.personality ?? null,
        currentSituation,
        player.character_name
      );

      // Gemini가 action_category를 출력하면 실제 NPC 저항 스탯으로 DC 계산
      const choices: ActionChoice[] = rawChoices.map((choice) => {
        if (!choice.dice_check) return choice;
        const category = choice.dice_check.action_category as ActionCategory | undefined;
        const realDc = category
          ? (computeDCFromCategory(category, resistance) ?? defaultResistanceStats().mental_willpower)
          : defaultResistanceStats().mental_willpower;
        return {
          ...choice,
          dice_check: { ...choice.dice_check, dc: realDc },
        };
      });

      // active_turn_state 저장 (다른 플레이어에게 선택지 공개)
      await (supabase
        .from("Game_Session")
        .update({
          active_turn_state: {
            choices,
            status: "choosing",
            player_name: player.player_name,
          },
        } as unknown as Record<string, unknown>)
        .eq("id", session_id));

      return NextResponse.json({ choices });
    } catch (err) {
      console.error("[ChoicesRoute] generateChoices failed:", err);
      // 폴백 선택지도 active_turn_state에 저장
      await (supabase
        .from("Game_Session")
        .update({
          active_turn_state: {
            choices: FALLBACK_CHOICES,
            status: "choosing",
            player_name: player.player_name,
          },
        } as unknown as Record<string, unknown>)
        .eq("id", session_id));
      return NextResponse.json({ choices: FALLBACK_CHOICES, is_fallback: true });
    }
  } catch (err) {
    console.error("[ChoicesRoute] Unexpected error:", err);
    return NextResponse.json({ choices: FALLBACK_CHOICES, is_fallback: true });
  }
}
