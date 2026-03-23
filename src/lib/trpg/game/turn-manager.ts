import type { GameSession, TurnParticipant } from "@/lib/trpg/types/game";

export function getNextTurn(session: GameSession): TurnParticipant | null {
  const { turn_order, current_turn_player_id, turn_number } = session;
  if (turn_order.length === 0) return null;

  const currentIndex = turn_order.findIndex(
    (p) => p.id === current_turn_player_id
  );

  const nextIndex = (currentIndex + 1) % turn_order.length;
  return turn_order[nextIndex];
}

export function buildTurnOrder(playerIds: string[]): TurnParticipant[] {
  return playerIds.map((id) => ({ type: "player", id }));
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
