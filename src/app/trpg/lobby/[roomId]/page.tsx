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

// PC 존재 확인 후 WaitingRoom을 렌더링하는 내부 컴포넌트.
// RoomCard를 통해 정상 입장한 경우 PC는 이미 생성되어 있음.
// 직접 URL 접근 등 예외 케이스에만 fallback join 시도.
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
    fetch(`/api/trpg/sessions/${sessionId}/my-character?localId=${localId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));

        if (res.status === 409) {
          // 이미 시작된 방
          alert(data.error ?? "이미 시작된 방입니다.");
          router.replace("/trpg/lobby");
          return;
        }
        if (res.status === 404) {
          alert(data.error ?? "방을 찾을 수 없습니다.");
          router.replace("/trpg/lobby");
          return;
        }

        if (data.exists) return; // 이미 참여 중 → 그대로 대기실

        // PC 없음 (직접 URL 접근 등) → 로비로 리다이렉트
        // 정상 흐름(RoomCard → JoinRoomModal)에선 여기 도달하지 않음
        router.replace("/trpg/lobby");
      })
      .catch(() => {
        // 네트워크 오류는 무시하고 대기실 렌더 유지
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <WaitingRoom sessionId={sessionId} profile={profile} />;
}
