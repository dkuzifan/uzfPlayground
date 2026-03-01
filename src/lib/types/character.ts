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
  | "bard";

export interface CharacterStats {
  hp: number;
  max_hp: number;
  attack: number;
  defense: number;
  speed: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  type: "weapon" | "armor" | "consumable" | "quest" | "misc";
  description?: string;
  quantity: number;
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
  stats: CharacterStats;
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
}

// Personality test answers
export interface PersonalityTestAnswers {
  mbti_answers: Record<string, string>;
  enneagram_answers: Record<string, number>;
  dnd_answers: Record<string, string>;
}
