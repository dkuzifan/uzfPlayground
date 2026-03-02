"use client";

import { useParams } from "next/navigation";
import { useGameScreen } from "@/hooks/useGameScreen";
import { useGuestProfile } from "@/hooks/useGuestProfile";
import ChatLog from "@/components/trpg/game/ChatLog";
import ActionPanel from "@/components/trpg/game/ActionPanel";
import CharacterStatus from "@/components/trpg/game/CharacterStatus";
import TurnIndicator from "@/components/trpg/game/TurnIndicator";
import PlayerList from "@/components/trpg/game/PlayerList";
import DiceRollOverlay from "@/components/trpg/game/DiceRollOverlay";

export default function GamePage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { profile } = useGuestProfile();
  const localId = profile?.localId ?? null;

  const {
    session,
    players,
    logs,
    myPlayer,
    isMyTurn,
    choices,
    choicesLoading,
    isSubmitting,
    loading,
    error,
    submitAction,
    pendingDice,
    diceResult,
    resolveDice,
    clearDiceResult,
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
        </div>
      </div>

      {pendingDice && (
        <DiceRollOverlay
          dc={pendingDice.dc}
          checkLabel={pendingDice.check_label}
          onRoll={resolveDice}
          diceResult={diceResult}
          onClose={clearDiceResult}
        />
      )}
    </>
  );
}
