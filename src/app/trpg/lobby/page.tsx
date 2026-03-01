export default function LobbyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">로비</h1>
        <button className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20">
          방 만들기
        </button>
      </div>
      {/* TODO: RoomCard 목록 + CreateRoomModal 삽입 */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-neutral-500">
        방 목록 (구현 예정)
      </div>
    </div>
  );
}
