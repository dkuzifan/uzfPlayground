import type { ActionLog, GmResponse, StateChanges } from "@/lib/trpg/types/game";
import type { PlayerCharacter } from "@/lib/trpg/types/character";

export function applyStateChanges(
  players: PlayerCharacter[],
  stateChanges: StateChanges[]
): PlayerCharacter[] {
  return players.map((player) => {
    const change = stateChanges.find((c) => c.target_id === player.id);
    if (!change) return player;

    const newHp = Math.max(
      0,
      Math.min(
        player.stats.max_hp,
        player.stats.hp + (change.hp_delta ?? 0)
      )
    );

    return {
      ...player,
      stats: { ...player.stats, hp: newHp },
    };
  });
}

export function buildActionLog(
  sessionId: string,
  turnNumber: number,
  speakerName: string,
  speakerId: string,
  action: string,
  gmResponse: GmResponse
): Omit<ActionLog, "id" | "created_at"> {
  return {
    session_id: sessionId,
    turn_number: turnNumber,
    speaker_type: "player",
    speaker_id: speakerId,
    speaker_name: speakerName,
    action_type: "free_input",
    content: action,
    outcome: gmResponse.outcome,
    state_changes: gmResponse.state_changes[0] ?? {},
  };
}
