"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import WaitingRoom from "@/components/tales/trpg/lobby/WaitingRoom";
import { useAuthProfile } from "@/hooks/useAuthProfile";

interface WaitingRoomPageProps {
  params: Promise<{ roomId: string }>;
}

export default function WaitingRoomPage({ params }: WaitingRoomPageProps) {
  const { roomId } = use(params);
  const router = useRouter();
  const { profile, mounted } = useAuthProfile();

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
    <JoinAndShow sessionId={roomId} profile={profile} />
  );
}

function JoinAndShow({
  sessionId,
  profile,
}: {
  sessionId: string;
  profile: NonNullable<ReturnType<typeof useAuthProfile>["profile"]>;
}) {
  const router = useRouter();

  useEffect(() => {
    // auth 쿠키가 자동으로 전송되므로 별도 localId 불필요
    fetch(`/api/tales/trpg/sessions/${sessionId}/my-character`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));

        if (res.status === 409) {
          // 이미 시작된 방
          alert(data.error ?? "이미 시작된 방입니다.");
          router.replace("/tales/trpg/lobby");
          return;
        }
        if (res.status === 404) {
          alert(data.error ?? "방을 찾을 수 없습니다.");
          router.replace("/tales/trpg/lobby");
          return;
        }

        if (data.exists) return; // 이미 참여 중 → 그대로 대기실

        // PC 없음 (직접 URL 접근 등) → 로비로 리다이렉트
        // 정상 흐름(RoomCard → JoinRoomModal)에선 여기 도달하지 않음
        router.replace("/tales/trpg/lobby");
      })
      .catch(() => {
        // 네트워크 오류는 무시하고 대기실 렌더 유지
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <WaitingRoom sessionId={sessionId} profile={profile} />;
}
