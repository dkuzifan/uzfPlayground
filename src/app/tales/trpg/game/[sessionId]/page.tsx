"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useGameScreen } from "@/hooks/tales/trpg/useGameScreen";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import ChatLog from "@/components/tales/trpg/game/ChatLog";
import ActionPanel from "@/components/tales/trpg/game/ActionPanel";
import CharacterStatus from "@/components/tales/trpg/game/CharacterStatus";
import PlayerList from "@/components/tales/trpg/game/PlayerList";
import GameControls from "@/components/tales/trpg/game/GameControls";
import DiceRollOverlay from "@/components/tales/trpg/game/DiceRollOverlay";
import NpcEmotionPanel from "@/components/tales/trpg/game/NpcEmotionPanel";
import QuestTrackerPanel from "@/components/tales/trpg/game/QuestTrackerPanel";
import LoreDiscoveryPanel from "@/components/tales/trpg/game/LoreDiscoveryPanel";
import GmPanel from "@/components/tales/trpg/game/GmPanel";
import ScenePhaseIndicator from "@/components/tales/trpg/game/ScenePhaseIndicator";
import EndingScreen from "@/components/tales/trpg/game/EndingScreen";

// ── 모바일 탭 ────────────────────────────────────────────
type MobileTab = "story" | "character" | "npc" | "quest" | "gm";

const MOBILE_TABS: { id: MobileTab; icon: string; label: string }[] = [
  { id: "story",     icon: "📖", label: "스토리" },
  { id: "character", icon: "👤", label: "캐릭터" },
  { id: "npc",       icon: "🎭", label: "NPC" },
  { id: "quest",     icon: "🗺", label: "퀘스트" },
  { id: "gm",        icon: "⚙",  label: "GM" },
];

// ── 유틸 ────────────────────────────────────────────────
function weatherIcon(weather: string) {
  if (weather.includes("폭우") || weather.includes("비")) return "🌧";
  if (weather.includes("눈")) return "❄️";
  if (weather.includes("안개")) return "🌫";
  if (weather.includes("폭풍") || weather.includes("번개")) return "⛈";
  if (weather.includes("맑음") || weather.includes("청명")) return "☀️";
  if (weather.includes("흐림") || weather.includes("구름")) return "☁️";
  return "🌤";
}
function timeIcon(time: string) {
  if (time.includes("심야") || time.includes("새벽")) return "🌙";
  if (time.includes("낮") || time.includes("정오")) return "☀️";
  if (time.includes("황혼") || time.includes("저녁") || time.includes("노을")) return "🌆";
  if (time.includes("아침")) return "🌅";
  return "🕐";
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const { profile } = useAuthProfile();
  const localId = profile?.userId ?? null;

  const [mobileTab, setMobileTab] = useState<MobileTab>("story");

  const {
    session,
    scenario,
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
    gameEnded,
    leaveRoom,
    saveGame,
    deleteRoom,
    recentReactions,
    sendReaction,
    declareAssist,
  } = useGameScreen(sessionId, localId);

  // 시나리오 테마 → body data-theme 적용
  useEffect(() => {
    const theme = scenario?.theme;
    if (theme) {
      document.body.setAttribute("data-theme", theme);
      return () => document.body.removeAttribute("data-theme");
    }
  }, [scenario?.theme]);

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
  const env = session?.session_environment;
  const hasEnv = env && (env.weather || env.time_of_day);

  // GM 탭이 없는 경우 탭 목록 필터링
  const visibleTabs = MOBILE_TABS.filter(
    (t) => t.id !== "gm" || amIHost
  );

  // ── 공용 패널들 ──────────────────────────────────────
  const leftPanels = (
    <>
      <CharacterStatus
        player={myPlayer}
        statSchema={scenario?.character_config?.stat_schema}
        sessionTheme={scenario?.theme}
      />
      <PlayerList
        players={players}
        currentTurnPlayerId={session?.current_turn_player_id ?? null}
        myPlayerId={myPlayer?.id ?? null}
        statSchema={scenario?.character_config?.stat_schema}
      />
    </>
  );

  const rightPanels = (
    <>
      <NpcEmotionPanel
        npcs={npcs}
        dynamicStates={session?.npc_dynamic_states ?? null}
        sessionTheme={scenario?.theme}
      />
      <LoreDiscoveryPanel logs={logs} myPlayerId={myPlayer?.id} />
      <QuestTrackerPanel
        questTracker={session?.quest_tracker ?? null}
        objectives={scenario?.objectives}
      />
      {amIHost && session && scenario && myPlayer && (
        <GmPanel
          sessionId={sessionId}
          scenarioId={session.scenario_id}
          myPlayerId={myPlayer.id}
          npcs={npcs}
          dynamicStates={session.npc_dynamic_states ?? null}
          questTracker={session.quest_tracker ?? null}
        />
      )}
      <GameControls
        amIHost={amIHost}
        onLeave={leaveRoom}
        onSave={saveGame}
        onDelete={deleteRoom}
        saveStatus={saveStatus}
      />
    </>
  );

  return (
    <>
      <div className="game-screen flex h-[calc(100vh-56px)] flex-col">

        {/* ── 상단 씬 바 ─────────────────────────────── */}
        <div
          className="flex flex-shrink-0 items-center gap-2 border-b px-3 py-1.5"
          style={{
            borderColor: "var(--skin-border)",
            backgroundColor: "var(--skin-bg-secondary)",
          }}
        >
          {session?.scene_phase && (
            <ScenePhaseIndicator phase={session.scene_phase} />
          )}
          {hasEnv && (
            <span className="hidden text-xs sm:inline" style={{ color: "var(--skin-text-muted)" }}>
              {env.weather && `${weatherIcon(env.weather)} ${env.weather}`}
              {env.weather && env.time_of_day && " · "}
              {env.time_of_day && `${timeIcon(env.time_of_day)} ${env.time_of_day}`}
            </span>
          )}
          {/* 현재 턴 배지 */}
          {currentTurnPlayer && (
            <span
              className="ml-auto rounded-full px-3 py-0.5 text-xs font-semibold transition-all"
              style={{
                color: isMyTurn ? "var(--skin-bg)" : "var(--skin-accent)",
                backgroundColor: isMyTurn ? "var(--skin-accent)" : "var(--skin-accent-glow)",
                boxShadow: isMyTurn ? "0 0 10px var(--skin-accent-glow)" : "none",
              }}
            >
              {isMyTurn ? "⚔ 내 차례" : `${currentTurnPlayer.player_name}의 차례`}
            </span>
          )}
        </div>

        {/* ══════════════════════════════════════════════
            DESKTOP — 3열 레이아웃 (md+)
        ══════════════════════════════════════════════ */}
        <div className="hidden flex-1 gap-3 overflow-hidden p-3 md:flex">

          {/* 좌 패널 */}
          <div className="flex w-[240px] flex-shrink-0 flex-col gap-3 overflow-y-auto">
            {leftPanels}
          </div>

          {/* 중앙 */}
          <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
            <ChatLog logs={logs} myPlayerId={myPlayer?.id} />
            <ActionPanel
              isMyTurn={isMyTurn}
              currentTurnName={currentTurnPlayer?.player_name ?? ""}
              choices={choices}
              choicesLoading={choicesLoading}
              isSubmitting={isSubmitting}
              activeTurnState={session?.active_turn_state ?? null}
              myPlayerId={myPlayer?.id}
              onSubmit={submitAction}
              onReact={sendReaction}
              onAssist={declareAssist}
            />
          </div>

          {/* 우 패널 */}
          <div className="flex w-[260px] flex-shrink-0 flex-col gap-3 overflow-y-auto">
            {rightPanels}
          </div>
        </div>

        {/* ══════════════════════════════════════════════
            MOBILE — 탭 레이아웃 (md 미만)
        ══════════════════════════════════════════════ */}
        <div className="flex flex-1 flex-col overflow-hidden md:hidden">

          {/* 탭 콘텐츠 */}
          <div className="flex-1 overflow-y-auto p-3">
            {mobileTab === "story" && (
              <ChatLog logs={logs} myPlayerId={myPlayer?.id} />
            )}
            {mobileTab === "character" && (
              <div className="space-y-3">
                {leftPanels}
              </div>
            )}
            {mobileTab === "npc" && (
              <NpcEmotionPanel
                npcs={npcs}
                dynamicStates={session?.npc_dynamic_states ?? null}
                sessionTheme={scenario?.theme}
              />
            )}
            {mobileTab === "quest" && (
              <div className="space-y-3">
                <QuestTrackerPanel
                  questTracker={session?.quest_tracker ?? null}
                  objectives={scenario?.objectives}
                />
                <LoreDiscoveryPanel logs={logs} myPlayerId={myPlayer?.id} />
              </div>
            )}
            {mobileTab === "gm" && amIHost && session && scenario && myPlayer && (
              <div className="space-y-3">
                <GmPanel
                  sessionId={sessionId}
                  scenarioId={session.scenario_id}
                  myPlayerId={myPlayer.id}
                  npcs={npcs}
                  dynamicStates={session.npc_dynamic_states ?? null}
                  questTracker={session.quest_tracker ?? null}
                />
                <GameControls
                  amIHost={amIHost}
                  onLeave={leaveRoom}
                  onSave={saveGame}
                  onDelete={deleteRoom}
                  saveStatus={saveStatus}
                />
              </div>
            )}
          </div>

          {/* 스토리 탭일 때만 ActionPanel 하단 고정 */}
          {mobileTab === "story" && (
            <div
              className="flex-shrink-0 border-t p-3"
              style={{ borderColor: "var(--skin-border)", backgroundColor: "var(--skin-bg-secondary)" }}
            >
              <ActionPanel
                isMyTurn={isMyTurn}
                currentTurnName={currentTurnPlayer?.player_name ?? ""}
                choices={choices}
                choicesLoading={choicesLoading}
                isSubmitting={isSubmitting}
                activeTurnState={session?.active_turn_state ?? null}
                myPlayerId={myPlayer?.id}
                onSubmit={submitAction}
                onReact={sendReaction}
                onAssist={declareAssist}
              />
            </div>
          )}

          {/* 하단 탭 바 */}
          <nav
            className="flex h-14 flex-shrink-0 border-t"
            style={{ borderColor: "var(--skin-border)", backgroundColor: "var(--skin-bg-secondary)" }}
          >
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setMobileTab(tab.id)}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors"
                style={{
                  color: mobileTab === tab.id ? "var(--skin-accent)" : "var(--skin-text-muted)",
                }}
              >
                <span className="text-lg leading-none">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

      </div>

      {/* ── 엔딩 화면 ───────────────────────────────── */}
      {gameEnded && (
        <EndingScreen
          endingId={session?.quest_tracker?.ending_id}
          endings={scenario?.endings}
          finalNarration={
            [...logs].reverse().find((l) => l.speaker_type === "gm")?.content
          }
          sessionId={sessionId}
          onLeave={() => router.replace("/tales/trpg/lobby")}
        />
      )}

      {/* ── 감정 반응 토스트 ─────────────────────────── */}
      {recentReactions.length > 0 && (
        <div className="pointer-events-none fixed bottom-24 right-6 z-40 flex flex-col items-end gap-2">
          {recentReactions.map((r) => (
            <div
              key={r.id}
              className="flex animate-bounce items-center gap-1.5 rounded-full border border-black/10 bg-white/90 px-3 py-1.5 shadow-lg dark:border-white/15 dark:bg-neutral-800/90"
            >
              <span className="text-lg">{r.emoji}</span>
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">{r.playerName}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 주사위 오버레이 ──────────────────────────── */}
      {pendingDice && (
        <DiceRollOverlay
          dc={pendingDice.dc}
          modifier={pendingDice.modifier}
          checkLabel={pendingDice.check_label}
          onClose={resolveAndContinue}
        />
      )}

      {/* ── 방 삭제 모달 ─────────────────────────────── */}
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
              onClick={() => router.replace("/tales/trpg/lobby")}
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
