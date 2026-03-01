// ============================================================
// Game Types
// ============================================================

import type { PlayerCharacter } from "./character";

export type SessionStatus = "waiting" | "in_progress" | "completed" | "abandoned";

export type SpeakerType = "player" | "npc" | "gm" | "system";

export type ActionType =
  | "choice"
  | "free_input"
  | "gm_narration"
  | "npc_dialogue"
  | "system_event";

export type ActionOutcome =
  | "critical_success"
  | "success"
  | "partial"
  | "failure"
  | null;

export type ScenarioTheme = "fantasy" | "mystery" | "horror" | "sci-fi";

export type NpcRole = "enemy" | "ally" | "neutral" | "boss";

// ── Scenario ──────────────────────────────────────────────

export interface Scenario {
  id: string;
  title: string;
  theme: ScenarioTheme;
  description: string | null;
  gm_system_prompt: string;
  fixed_truths: Record<string, unknown>;
  clear_conditions: string[];
  max_players: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── NPC ───────────────────────────────────────────────────

export interface NpcStats {
  hp: number;
  max_hp: number;
  attack: number;
  defense: number;
}

export interface NpcPersona {
  id: string;
  scenario_id: string;
  session_id: string | null;
  name: string;
  role: NpcRole;
  mbti: string | null;
  enneagram: number | null;
  dnd_alignment: string | null;
  appearance: string | null;
  personality: string | null;
  hidden_motivation: Record<string, unknown>;
  system_prompt: string;
  stats: NpcStats;
  created_at: string;
}

// ── Game Session ──────────────────────────────────────────

export type TurnParticipant =
  | { type: "player"; id: string }
  | { type: "npc"; id: string };

export interface GameSession {
  id: string;
  scenario_id: string;
  room_name: string;
  status: SessionStatus;
  current_turn_player_id: string | null;
  turn_order: TurnParticipant[];
  turn_number: number;
  timeout_at: string | null;
  turn_duration_seconds: number;
  max_players: number;
  host_player_id: string | null;
  created_at: string;
  updated_at: string;
}

// Session with joined data
export interface GameSessionWithDetails extends GameSession {
  scenario: Scenario;
  players: PlayerCharacter[];
  npcs: NpcPersona[];
}

// ── Action Log ────────────────────────────────────────────

export interface StateChanges {
  hp_delta?: number;
  target_id?: string;
  effects?: string[];
  [key: string]: unknown;
}

export interface ActionLog {
  id: string;
  session_id: string;
  turn_number: number;
  speaker_type: SpeakerType;
  speaker_id: string | null;
  speaker_name: string;
  action_type: ActionType;
  content: string;
  outcome: ActionOutcome;
  state_changes: StateChanges;
  created_at: string;
}

// ── Session Memory ────────────────────────────────────────

export interface SessionMemory {
  id: string;
  session_id: string;
  summary_text: string;
  last_summarized_turn: number;
  key_facts: string[];
  created_at: string;
  updated_at: string;
}

// ── GM Response (AI Output) ───────────────────────────────

export interface GmResponse {
  narration: string;
  outcome: ActionOutcome;
  state_changes: StateChanges[];
  next_scene_hint?: string;
}

// ── Action Choice ─────────────────────────────────────────

export interface ActionChoice {
  id: string;
  label: string;
  description: string;
  action_type: "choice";
}

// ── Real-time Events ──────────────────────────────────────

export type RealtimeEventType =
  | "turn_start"
  | "turn_end"
  | "action_submitted"
  | "gm_response"
  | "player_joined"
  | "player_left"
  | "session_status_changed";

export interface RealtimeEvent {
  type: RealtimeEventType;
  session_id: string;
  payload: unknown;
  timestamp: string;
}
