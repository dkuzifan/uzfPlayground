import { NextResponse } from "next/server";
import { getGeminiModel } from "@/lib/ai/gemini";

// ── POST /api/trpg/scenarios/generate-prompt ─────────────────────────
// 제목/테마/설명/직업 목록을 기반으로 GM 시스템 프롬프트 초안 생성
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, theme, description, job_labels } = body as {
    title?: string;
    theme?: string;
    description?: string;
    job_labels?: Record<string, string>;
  };

  if (!title?.trim() || !theme?.trim()) {
    return NextResponse.json(
      { error: "title과 theme은 필수입니다." },
      { status: 400 }
    );
  }

  const jobList = job_labels
    ? Object.values(job_labels).join(", ")
    : "다양한 직업";

  const prompt = `당신은 TRPG 시나리오 제작 도우미입니다.
다음 정보를 바탕으로 AI 게임 마스터(GM)가 게임 진행 내내 참고할 시스템 프롬프트를 작성해주세요.

시나리오 정보:
- 제목: ${title.trim()}
- 테마: ${theme.trim()}
- 설명: ${description?.trim() || "(없음)"}
- 등장 직업: ${jobList}

작성 조건:
1. [세계관] 섹션: 배경, 설정, 분위기를 구체적으로 기술
2. [GM 규칙] 섹션: 플레이어 행동 처리 방식, 금지 사항, 톤앤매너 지침
3. 한국어로 작성
4. 전체 400~700자 분량
5. 다른 설명 없이 시스템 프롬프트 본문만 출력

시스템 프롬프트:`;

  try {
    const model = getGeminiModel("gemini-2.5-pro");
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    return NextResponse.json({ gm_system_prompt: text });
  } catch (err) {
    console.error("[generate-prompt]", err);
    return NextResponse.json(
      { error: "AI 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}
