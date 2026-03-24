import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 인증 없이 접근 가능한 경로
const PUBLIC_PATHS = ["/login", "/auth/callback", "/pin", "/api/auth/verify-pin"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 공개 경로는 그대로 통과
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next({ request });
  }

  // Supabase 세션 확인 — @supabase/ssr Next.js 16 패턴
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set({ name, value, ...options })
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 미인증 → /login
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 인증됐지만 PIN 미통과 → /pin
  const pinVerified = request.cookies.get("pin_verified")?.value;
  if (!pinVerified) {
    const pinUrl = new URL("/pin", request.url);
    pinUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(pinUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // 정적 파일, 이미지, 파비콘, API 라우트 제외
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
