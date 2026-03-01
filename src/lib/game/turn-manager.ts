import type { GameSession, TurnParticipant } from "@/lib/types/game";

export function getNextTurn(session: GameSession): TurnParticipant | null {
  const { turn_order, current_turn_player_id, turn_number } = session;
  if (turn_order.length === 0) return null;

  const currentIndex = turn_order.findIndex(
    (p) => p.id === current_turn_player_id
  );

  const nextIndex = (currentIndex + 1) % turn_order.length;
  return turn_order[nextIndex];
}

export function buildTurnOrder(
  playerIds: string[],
  npcIds: string[]
): TurnParticipant[] {
  const players: TurnParticipant[] = playerIds.map((id) => ({
    type: "player",
    id,
  }));
  const npcs: TurnParticipant[] = npcIds.map((id) => ({ type: "npc", id }));

  // 플레이어와 NPC 교대 배치
  const order: TurnParticipant[] = [];
  const maxLen = Math.max(players.length, npcs.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < players.length) order.push(players[i]);
    if (i < npcs.length) order.push(npcs[i]);
  }
  return order;
}

export function isPlayerTurn(
  session: GameSession,
  playerId: string
): boolean {
  return session.current_turn_player_id === playerId;
}

export function getTimeoutAt(durationSeconds: number): string {
  return new Date(Date.now() + durationSeconds * 1000).toISOString();
}
