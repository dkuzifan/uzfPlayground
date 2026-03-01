interface WaitingRoomPageProps {
  params: Promise<{ roomId: string }>;
}

export default async function WaitingRoomPage({ params }: WaitingRoomPageProps) {
  const { roomId } = await params;

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold text-white">대기실</h1>
      <p className="mb-8 text-neutral-400">Room ID: {roomId}</p>
      {/* TODO: PlayerList + 게임 시작 버튼 삽입 */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-neutral-500">
        대기실 UI (구현 예정)
      </div>
    </div>
  );
}
