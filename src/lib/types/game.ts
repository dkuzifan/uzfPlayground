// ============================================================
// Game Types
// ============================================================

import type { PlayerCharacter, NpcDynamicState } from "./character";

export type SessionStatus = "waiting" | "in_progress" | "completed" | "abandoned";

export type ScenePhase = "exploration" | "tension" | "climax" | "resolution";

// ── Story Blueprint ────────────────────────────────────────

export interface StoryAct {
  act: 1 | 2 | 3 | 4;
  phase: ScenePhase;
  title: string;                  // 예: "유적의 그림자"
  summary: string;                // 이 막에서 일어나는 일
  npcs_to_introduce: string[];    // 이 막에서 처음 등장하는 NPC 이름 목록
  key_events: string[];           // 계획된 핵심 이벤트/비트
  gm_tone: string;                // 서사 톤 지침
  transition_hint: string;        // 다음 막으로 넘어가는 조건/신호
}

export interface StoryBlueprint {
  story_title: string;            // 이번 세션의 이야기 제목
  thematic_motif: string;         // 핵심 테마/분위기
  acts: StoryAct[];               // 4막 구조
}

export type SpeakerType = "player" | "npc" | "gm" | "system";

export type ActionType =
  | "choice"
  | "free_input"
  | "gm_narration"
  | "npc_dialogue"
  | "system_event"
  | "lore_discovery";

export type ActionOutcome =
  | "critical_success"
  | "success"
  | "partial"
  | "failure"
  | null;

export type ScenarioTheme = "fantasy" | "mystery" | "horror" | "sci-fi";

export type NpcRole = "enemy" | "ally" | "neutral" | "boss";

// ── Objectives & Endings ──────────────────────────────────

export type ObjectiveType =
  | "eliminate"   // 특정 NPC/위협 제거
  | "reach"       // 특정 장소 도달
  | "find"        // 정보/물건 발견
  | "obtain"      // 아이템 획득
  | "protect"     // NPC/장소 보호
  | "survive"     // N턴 생존
  | "solve"       // 퍼즐/수수께끼 해결
  | "reveal"      // 숨겨진 사실 폭로
  | "escort"      // NPC 동행/호위
  | "choose";     // 분기점 선택

export interface ObjectiveCondition {
  type: ObjectiveType;
  target_description: string;   // 예: "카림을 마을 밖으로 데려간다"
  target_npc_id?: string;       // 특정 NPC 연동 시
  progress_max: number;         // Clock 최대값 (보통 4 또는 6)
  is_hidden?: boolean;          // 플레이어에게 숨겨진 목표 여부
}

export interface ScenarioObjectives {
  primary: ObjectiveCondition;
  secondary?: ObjectiveCondition[];
  secret?: ObjectiveCondition;
  doom_clock_interval: number;  // 몇 턴마다 Doom Clock +1
  doom_clock_max: number;       // Doom Clock 최대값 (초과 시 Bad End)
}

export type EndingTone = "triumphant" | "bittersweet" | "tragic" | "mysterious";

export type EndingTrigger =
  | "primary_complete"
  | "primary_failed"
  | "doom_maxed"
  | "secret_complete"
  | "custom";

export interface EndingCondition {
  id: string;
  label: string;
  description: string;
  trigger: EndingTrigger;
  custom_condition?: string;    // trigger="custom" 일 때 GM에게 전달할 판단 지침
  tone: EndingTone;
}

export interface ScenarioEndings {
  endings: EndingCondition[];
}

// ── Quest Tracker ──────────────────────────────────────────

export interface QuestTracker {
  primary_progress: number;       // 메인 목표 진척도 (0 ~ primary.progress_max)
  secondary_progress: number[];   // 서브 목표별 진척도 배열
  secret_triggered: boolean;      // 비밀 목표 달성 여부
  quest_clock: number;            // 플레이어 행동으로 증가 (= primary_progress alias, UI용)
  doom_clock: number;             // N턴마다 자동 증가
  doom_clock_interval: number;    // Scenario.objectives에서 복사
  doom_clock_max: number;         // Scenario.objectives에서 복사
  turn_count: number;             // 총 턴 수 (doom_clock 계산용)
  ended: boolean;                 // 게임 종료 여부
  ending_id?: string;             // 달성된 엔딩 ID
}

// ── Character Config ───────────────────────────────────────

export interface JobDefinition {
  id: string;           // 내부 식별자 (예: "warrior")
  name: string;         // 표시 이름 (예: "전사")
  description: string;  // 직업 설명
  base_stats: Record<string, number>; // { hp: 120, attack: 15, ... }
}

export interface CharacterConfig {
  stat_schema: string[];   // 이 시나리오에서 사용하는 스탯 종류 (예: ["hp", "attack", "defense", "speed"])
  jobs: JobDefinition[];
}

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
  objectives?: ScenarioObjectives | null;
  endings?: ScenarioEndings | null;
  character_config?: CharacterConfig | null;
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

// ── ActiveTurnState ────────────────────────────────────────

// 다른 플레이어에게 보여줄 현재 턴 진행 상태
export interface ActiveTurnState {
  choices: ActionChoice[];
  status: "choosing" | "rolling";
  selected_label?: string;  // rolling 상태일 때 선택한 행동 텍스트
  player_name: string;
}

// ── Game Session ──────────────────────────────────────────

export type TurnParticipant = { type: "player"; id: string };

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
  // v2: 세션 환경 (날씨, 시간대)
  session_environment: { weather: string; time_of_day: string } | null;
  // v2: 퀘스트 트래커
  quest_tracker: QuestTracker | null;
  // v3: 미뤄둔 Lore 키워드 대기열
  pending_lore_queue: string[];
  // v3: 씬 페이즈
  scene_phase: ScenePhase;
  // v4: 활성 턴 상태 (다른 플레이어에게 선택지/주사위 상태 공개)
  active_turn_state: ActiveTurnState | null;
  // v5: 이야기 설계도
  story_blueprint: StoryBlueprint | null;
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
  inventory: string[];
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
  action_category?: string;
  dice_check?: {
    dc: number;
    check_label: string;
    action_category: string;
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
