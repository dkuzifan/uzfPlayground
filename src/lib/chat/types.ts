export type Mood = "happy" | "neutral" | "sad" | "angry" | "surprised";

export interface EmotionState {
  mood: Mood;
  intensity: number; // 0~100
}

export interface AiCharacter {
  id: string;
  local_id: string;
  name: string;
  bio: string | null;
  personality: string;
  creator_bio: string | null;
  is_public: boolean;
  portrait_url: string | null;
  created_at: string;
}

// personality 제외 — 공개 캐릭터 목록 응답용
export type AiCharacterPublic = Omit<AiCharacter, "personality">;

export interface ChatMessage {
  id: string;
  character_id: string;
  local_id: string;
  role: "user" | "assistant";
  content: string;
  emotion_state: EmotionState | null;
  created_at: string;
}
