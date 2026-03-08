// ============================================================
// Game Types
// ============================================================

import type { PlayerCharacter, NpcDynamicState } from "./character";

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

import type {
  SpeciesInfo,
  ResistanceStats,
  LinguisticProfile,
  TastePreference,
} from "./character";

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
  // v2: 다이내믹 페르소나 필드
  resistance_stats: ResistanceStats;
  species_info: SpeciesInfo;
  linguistic_profile: LinguisticProfile;
  taste_preferences: TastePreference[];
  decay_rate_negative: number;
  camaraderie_threshold: number;
  // v3: 세계관 지식 접근 레벨 (1=평민, 5=학자/귀족, 10=극비)
  knowledge_level: number;
  created_at: string;
}

// NPC 주관적 기억 (망각 연산 적용 후 형태)
export interface NpcMemory {
  id: string;
  session_id: string;
  npc_id: string;
  summary_text: string;              // NPC 주관적 기억 텍스트
  emotional_tags: Record<string, number>; // { anger: 80, thrill: 20 }
  is_core_memory: boolean;           // true이면 λ=0 (절대 잊히지 않음)
  created_at_turn: number;           // 기억 생성 턴 (Δt 계산용)
  decayed_emotion_level: number;     // 망각 연산 적용 후 감정 강도 (0~100)
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
  // v2: NPC 동적 심리 상태 맵 (키: NPC ID)
  npc_dynamic_states: Record<string, NpcDynamicState> | null;
  // v3: 미뤄둔 Lore 키워드 대기열
  pending_lore_queue: string[];
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
  npc_id: string | null;   // null = 전역 요약, 값 있음 = NPC별 주관적 기억
  summary_text: string;
  last_summarized_turn: number;
  key_facts: string[];
  emotional_tags: Record<string, number>;
  is_core_memory: boolean;
  created_at_turn: number;
  created_at: string;
  updated_at: string;
}

// ── Dice / HP Change ──────────────────────────────────────

export interface DiceRoll {
  rolled: number;    // d20 결과 (1~20)
  modifier: number;  // 직업 보너스
  total: number;     // rolled + modifier
  label: string;     // 예: "판정"
}

export interface DiceCheckInfo {
  dc: number;
  check_label: string;  // "전투 판정", "설득 판정" 등
}

export interface DiceResolveResult {
  rolled: number;
  modifier: number;
  total: number;
  dc: number;
  outcome: ActionOutcome;
}

export interface HpChange {
  target_id: string;
  name: string;
  old_hp: number;
  new_hp: number;
  delta: number;
}

// ── Raw Player (DB 스키마 직접 매핑) ──────────────────────

export interface RawPlayer {
  id: string;
  session_id: string;
  user_id: string;
  player_name: string;
  character_name: string;
  job: string;
  personality_summary: string | null;
  stats: { hp: number; max_hp: number; attack: number; defense: number; speed: number };
  is_active: boolean;
}

// ── GM Response (AI Output) ───────────────────────────────

export interface GmResponse {
  narration: string;
  outcome: ActionOutcome;
  state_changes: StateChanges[];
  dice_roll?: DiceRoll;
  next_scene_hint?: string;
}

// ── Action Choice ─────────────────────────────────────────

export interface ActionChoice {
  id: string;
  label: string;
  description: string;
  action_type: "choice";
  dice_check?: {
    dc: number;
    check_label: string;
  };
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
