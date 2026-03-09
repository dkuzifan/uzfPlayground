// ============================================================
// Character Types
// ============================================================

export type MBTIType =
  | "INTJ" | "INTP" | "ENTJ" | "ENTP"
  | "INFJ" | "INFP" | "ENFJ" | "ENFP"
  | "ISTJ" | "ISFJ" | "ESTJ" | "ESFJ"
  | "ISTP" | "ISFP" | "ESTP" | "ESFP";

export type EnneagramType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type DnDAlignment =
  | "lawful-good"
  | "neutral-good"
  | "chaotic-good"
  | "lawful-neutral"
  | "true-neutral"
  | "chaotic-neutral"
  | "lawful-evil"
  | "neutral-evil"
  | "chaotic-evil";

export type CharacterJob =
  | "warrior"
  | "mage"
  | "rogue"
  | "cleric"
  | "ranger"
  | "paladin"
  | "bard"
  | "adventurer";

// 신장 구분: 세계관 종족 특성 기반 카테고리
// 소형종: 고블린, 노움, 코볼트, 하플링 (은신+, 위협-)
// 표준형: 인간, 엘프, 드워프, 하프엘프, 오크 (기준값)
// 대형종: 드래곤본, 트롤, 반거인 혼혈 (위협+, 은신-)
// 거대형: 거인, 보스급 존재 (특수 판정 규칙)
export type SizeCategory = "소형종" | "표준형" | "대형종" | "거대형";

// 종족 및 수명 정보 (NPC/플레이어 공통)
export interface SpeciesInfo {
  species_name: string;
  current_age: number;
  expected_lifespan: number;
  size_category: SizeCategory;
}

export interface CharacterStats {
  hp: number;
  max_hp: number;
  attack: number;
  defense: number;
  speed: number;
}

// 기본 능력치 보정치 (온보딩 성향 테스트 + 종족 특성으로 결정)
export interface BaseModifiers {
  strength: number;
  dexterity: number;
  charisma: number;
  intelligence: number;
  constitution: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  type: "weapon" | "armor" | "consumable" | "quest" | "misc";
  description?: string;
  quantity: number;
}

// 장착 아이템 (다이내믹 DC 보정에 사용)
export interface EquippedItem {
  name: string;
  slot: "head" | "body" | "hands" | "feet" | "weapon" | "offhand" | "accessory";
  effect_description: string;
  stat_modifier: Partial<BaseModifiers>;
}

// 상태 이상 (버프/디버프, 다이내믹 DC 보정에 사용)
export interface StatusEffect {
  name: string;
  type: "buff" | "debuff";
  effect_description: string;
  stat_modifier: Partial<BaseModifiers>;
  duration_turns: number | null; // null = 무기한
}

export interface PersonalityProfile {
  mbti: MBTIType | null;
  enneagram: EnneagramType | null;
  dnd_alignment: DnDAlignment | null;
  summary: string;
}

export interface PlayerCharacter {
  id: string;
  session_id: string;
  user_id: string;
  player_name: string;
  character_name: string;
  job: CharacterJob;
  personality: PersonalityProfile;
  species_info: SpeciesInfo;
  stats: CharacterStats;
  base_modifiers: BaseModifiers;
  equipped_items: EquippedItem[];
  status_effects: StatusEffect[];
  inventory: InventoryItem[];
  is_active: boolean;
  joined_at: string;
  updated_at: string;
}

// Character creation form data
export interface CharacterCreateInput {
  character_name: string;
  job: CharacterJob;
  personality: PersonalityProfile;
  species_info: SpeciesInfo;
}

// Personality test answers
export interface PersonalityTestAnswers {
  mbti_answers: Record<string, string>;
  enneagram_answers: Record<string, number>;
  dnd_answers: Record<string, string>;
}

// ============================================================
// NPC Types (Schema v2)
// ============================================================

// NPC 저항 스탯 (System GM 주사위 판정의 DC 기준값)
export interface ResistanceStats {
  physical_defense: number; // 물리 공격/협박 저항 DC
  mental_willpower: number; // 설득/유혹/심리전 저항 DC
  perception: number;       // 은신/거짓말 탐지 DC
}

// 언어 프로필 (캐릭터 붕괴 방지)
export interface LinguisticProfile {
  speech_style: string;
  sentence_ending: string;
  honorific_rules: string;
  vocal_tics: string;
  evasion_style: string;
  forbidden_words: string[];
}

// 취향 도메인
export type TasteDomain = "interpersonal" | "aesthetic" | "lifestyle";

// 취향 모디파이어 (감정 변화량의 배율 조정)
export interface TasteModifiers {
  affinity_multiplier?: number;  // 호감도 배율 (음수 = 부호 역전)
  stress_multiplier?: number;    // 스트레스 배율
  fear_multiplier?: number;      // 공포 배율
}

// 취향 항목 (NPC_Persona.taste_preferences 배열 원소)
export interface TastePreference {
  id: string;
  domain: TasteDomain;
  name: string;
  description: string;        // 발동 시 프롬프트에 주입될 묘사
  trigger_keywords: string[]; // 유저 텍스트에서 매칭할 키워드
  modifiers: TasteModifiers;
}

// NPC 실시간 동적 심리 상태 (Game_Session.npc_dynamic_states 값)
export interface NpcDynamicState {
  // 단기 휘발성
  current_mood: string;
  mental_stress: number;      // 0~100
  physical_fatigue: number;   // 0~100
  fear_survival: number;      // 0~100
  self_image_management: number; // 0~100 (평판 관리 욕구)
  mob_mentality: number;      // 0~100 (군중 심리)
  // 장기 누적
  affinity: number;           // -100~100
  trust: number;              // -100~100
  power_dynamics: string;     // 텍스트 설명 (예: "유저가 압도적 우위")
  personal_debt: number;      // 0~100 (부채의식)
  sense_of_duty: number;      // 0~100 (의무감)
  camaraderie: number;        // 0~100 (전우애)
}

// 세션 환경 (다이내믹 DC 보정에 사용)
export interface SessionEnvironment {
  weather: string;     // 예: "폭우", "맑음", "안개"
  time_of_day: string; // 예: "심야", "낮", "황혼"
}

// 퀘스트 마일스톤 플래그
export interface QuestMilestone {
  type: "boolean" | "counter";
  value: boolean | number;
  target?: number; // counter 타입일 때만
}

// 퀘스트 트래커 (Game_Session.quest_tracker)
export interface QuestTracker {
  status: "IN_PROGRESS" | "CLEARED" | "FAILED";
  milestones: Record<string, QuestMilestone>;
}

// 턴 상태 머신
export type TurnState = "waiting" | "player_turn" | "npc_turn" | "timeout_resolving";
