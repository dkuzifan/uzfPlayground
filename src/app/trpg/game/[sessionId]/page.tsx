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
import NpcEmotionPanel from "@/components/trpg/game/NpcEmotionPanel";

function weatherIcon(weather: string): string {
  if (weather.includes("폭우") || weather.includes("비")) return "🌧";
  if (weather.includes("눈")) return "❄️";
  if (weather.includes("안개")) return "🌫";
  if (weather.includes("폭풍") || weather.includes("번개")) return "⛈";
  if (weather.includes("맑음") || weather.includes("청명")) return "☀️";
  if (weather.includes("흐림") || weather.includes("구름")) return "☁️";
  return "🌤";
}

function timeIcon(time: string): string {
  if (time.includes("심야") || time.includes("새벽")) return "🌙";
  if (time.includes("낮") || time.includes("정오")) return "☀️";
  if (time.includes("황혼") || time.includes("저녁") || time.includes("노을")) return "🌆";
  if (time.includes("아침") || time.includes("새벽")) return "🌅";
  return "🕐";
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const { profile } = useGuestProfile();
  const localId = profile?.localId ?? null;

  const {
    session,
    players,
    npcs,
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
          {/* 세션 환경 배지 */}
          {session?.session_environment && (
            session.session_environment.weather || session.session_environment.time_of_day
          ) && (
            <div className="flex items-center gap-2 rounded-xl border border-sky-200/60 bg-sky-50/70 px-3 py-1.5 text-xs text-sky-700 dark:border-sky-700/40 dark:bg-sky-900/20 dark:text-sky-300">
              {session.session_environment.weather && (
                <span>{weatherIcon(session.session_environment.weather)} {session.session_environment.weather}</span>
              )}
              {session.session_environment.weather && session.session_environment.time_of_day && (
                <span className="text-sky-400">·</span>
              )}
              {session.session_environment.time_of_day && (
                <span>{timeIcon(session.session_environment.time_of_day)} {session.session_environment.time_of_day}</span>
              )}
            </div>
          )}
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
          <NpcEmotionPanel
            npcs={npcs}
            dynamicStates={session?.npc_dynamic_states ?? null}
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
