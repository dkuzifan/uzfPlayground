import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { pin } = body as { pin?: string };
  if (!pin) return NextResponse.json({ error: "PIN이 필요합니다." }, { status: 400 });

  const correctPin = process.env.COMMON_PIN;
  if (!correctPin) {
    return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
  }

  if (pin !== correctPin) {
    return NextResponse.json({ error: "잘못된 PIN입니다." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });

  // 세션 쿠키 (Max-Age 없음 → 브라우저 종료 시 자동 삭제)
  response.cookies.set("pin_verified", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
