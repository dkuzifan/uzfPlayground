"use client";

import { useParams, useRouter } from "next/navigation";
import { useGameScreen } from "@/hooks/useGameScreen";
import { useGuestProfile } from "@/hooks/useGuestProfile";
import ChatLog from "@/components/trpg/game/ChatLog";
import ActionPanel from "@/components/trpg/game/ActionPanel";
import CharacterStatus from "@/components/trpg/game/CharacterStatus";
import TurnIndicator from "@/components/trpg/game/TurnIndicator";
import PlayerList from "@/components/trpg/game/PlayerList";
import GameControls from "@/components/trpg/game/GameControls";
import DiceRollOverlay from "@/components/trpg/game/DiceRollOverlay";

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const { profile } = useGuestProfile();
  const localId = profile?.localId ?? null;

  const {
    session,
    players,
    logs,
    myPlayer,
    isMyTurn,
    amIHost,
    choices,
    choicesLoading,
    isSubmitting,
    loading,
    error,
    submitAction,
    pendingDice,
    resolveAndContinue,
    saveStatus,
    sessionDeleted,
    leaveRoom,
    saveGame,
    deleteRoom,
  } = useGameScreen(sessionId, localId);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-56px)] items-center justify-center">
        <p className="text-sm text-neutral-400">게임 로딩 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[calc(100vh-56px)] items-center justify-center">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  const currentTurnPlayer = players.find(
    (p) => p.id === session?.current_turn_player_id
  );

  return (
    <>
      <div className="flex h-[calc(100vh-56px)] gap-4 p-4">
        {/* 좌: 채팅 로그 + 행동 패널 */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <ChatLog logs={logs} />
          <ActionPanel
            isMyTurn={isMyTurn}
            currentTurnName={currentTurnPlayer?.player_name ?? ""}
            choices={choices}
            choicesLoading={choicesLoading}
            isSubmitting={isSubmitting}
            onSubmit={submitAction}
          />
        </div>

        {/* 우: 사이드바 */}
        <div className="flex w-64 flex-shrink-0 flex-col gap-4">
          <CharacterStatus player={myPlayer} />
          <TurnIndicator
            currentTurnName={currentTurnPlayer?.player_name ?? ""}
            isMyTurn={isMyTurn}
          />
          <PlayerList
            players={players}
            currentTurnPlayerId={session?.current_turn_player_id ?? null}
            myPlayerId={myPlayer?.id ?? null}
          />
          <GameControls
            amIHost={amIHost}
            onLeave={leaveRoom}
            onSave={saveGame}
            onDelete={deleteRoom}
            saveStatus={saveStatus}
          />
        </div>
      </div>

      {pendingDice && (
        <DiceRollOverlay
          dc={pendingDice.dc}
          modifier={pendingDice.modifier}
          checkLabel={pendingDice.check_label}
          onClose={resolveAndContinue}
        />
      )}

      {/* 방 제거 모달 (방장이 방을 삭제하거나 Realtime으로 abandoned 수신 시) */}
      {sessionDeleted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-neutral-700 bg-neutral-50/95 p-8 shadow-2xl dark:bg-neutral-900/95">
            <div className="text-center">
              <p className="text-3xl">🏚️</p>
              <h2 className="mt-3 text-xl font-bold text-neutral-900 dark:text-neutral-100">
                방이 제거되었습니다
              </h2>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                방장이 방을 삭제했습니다. 로비로 이동합니다.
              </p>
            </div>
            <button
              onClick={() => router.replace("/trpg/lobby")}
              className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              로비로 이동
            </button>
          </div>
        </div>
      )}
    </>
  );
}
