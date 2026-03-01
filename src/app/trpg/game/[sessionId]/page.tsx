interface GamePageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function GamePage({ params }: GamePageProps) {
  const { sessionId } = await params;

  return (
    <div className="flex h-[calc(100vh-56px)] gap-4 p-4">
      {/* 좌: 채팅 로그 */}
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex-1 rounded-xl border border-white/10 bg-white/5 p-4 text-neutral-500">
          {/* TODO: ChatLog 컴포넌트 */}
          채팅 로그 (구현 예정) — Session: {sessionId}
        </div>
        {/* TODO: ActionPanel 컴포넌트 */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-neutral-500">
          행동 선택 패널 (구현 예정)
        </div>
      </div>

      {/* 우: 사이드바 */}
      <div className="flex w-64 flex-col gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-neutral-500">
          {/* TODO: CharacterStatus */}
          캐릭터 상태 (구현 예정)
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-neutral-500">
          {/* TODO: TurnIndicator */}
          턴 인디케이터 (구현 예정)
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-neutral-500">
          {/* TODO: PlayerList */}
          플레이어 목록 (구현 예정)
        </div>
      </div>
    </div>
  );
}
