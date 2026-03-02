"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import WaitingRoom from "@/components/trpg/lobby/WaitingRoom";
import { useGuestProfile } from "@/hooks/useGuestProfile";

interface WaitingRoomPageProps {
  params: Promise<{ roomId: string }>;
}

export default function WaitingRoomPage({ params }: WaitingRoomPageProps) {
  const { roomId } = use(params);
  const router = useRouter();
  const { profile, mounted } = useGuestProfile();

  // 프로필 없이 직접 접근 시 홈으로 리다이렉트
  useEffect(() => {
    if (mounted && profile === null) {
      router.replace("/");
    }
  }, [mounted, profile, router]);

  // 마운트 전 또는 프로필 없을 때는 아무것도 렌더링 안 함
  if (!mounted || !profile) {
    return (
      <div className="flex h-48 items-center justify-center text-neutral-500 text-sm">
        프로필 확인 중…
      </div>
    );
  }

  // 입장 처리는 WaitingRoom 내부(useWaitingRoom)가 아닌
  // 여기서 한 번만 호출 (컴포넌트 마운트 시 1회)
  return (
    <JoinAndShow sessionId={roomId} localId={profile.localId} profile={profile} />
  );
}

// 입장 API를 1회 호출하고 WaitingRoom을 렌더링하는 내부 컴포넌트
function JoinAndShow({
  sessionId,
  localId,
  profile,
}: {
  sessionId: string;
  localId: string;
  profile: NonNullable<ReturnType<typeof useGuestProfile>["profile"]>;
}) {
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/trpg/sessions/${sessionId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        localId,
        nickname: profile.nickname,
        avatarIndex: profile.avatarIndex,
      }),
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // 만석(409) 또는 세션 없음(404)이면 로비로 돌아감
        if (res.status === 409 || res.status === 404) {
          alert(data.error ?? "입장할 수 없는 방입니다.");
          router.replace("/trpg/lobby");
        }
      }
    });
    // 마운트 시 1회만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <WaitingRoom sessionId={sessionId} profile={profile} />;
}
