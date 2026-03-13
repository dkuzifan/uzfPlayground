// ============================================================
// Supabase Database Types (mirrors SQL schema)
// ============================================================

import type { ScenarioObjectives, ScenarioEndings, QuestTracker, ScenePhase } from "./game";

export interface Database {
  public: {
    Tables: {
      Scenario: {
        Row: {
          id: string;
          title: string;
          theme: string;
          description: string | null;
          gm_system_prompt: string;
          fixed_truths: Record<string, unknown>;
          clear_conditions: string[];
          max_players: number;
          is_active: boolean;
          character_creation_config: {
            available_jobs: string[];
            job_labels: Record<string, string>;
            personality_test_theme: string;
            character_name_hint: string;
          };
          objectives: ScenarioObjectives | null;
          endings: ScenarioEndings | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          theme: string;
          description?: string | null;
          gm_system_prompt: string;
          fixed_truths?: Record<string, unknown>;
          clear_conditions?: string[];
          max_players?: number;
          is_active?: boolean;
          character_creation_config?: {
            available_jobs?: string[];
            job_labels?: Record<string, string>;
            personality_test_theme?: string;
            character_name_hint?: string;
          };
          objectives?: ScenarioObjectives | null;
          endings?: ScenarioEndings | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["Scenario"]["Insert"]>;
        Relationships: [];
      };

      NPC_Persona: {
        Row: {
          id: string;
          scenario_id: string;
          session_id: string | null;
          name: string;
          role: string;
          mbti: string | null;
          enneagram: number | null;
          dnd_alignment: string | null;
          appearance: string | null;
          personality: string | null;
          hidden_motivation: Record<string, unknown>;
          system_prompt: string;
          stats: Record<string, unknown>;
          // v2 추가
          resistance_stats: {
            physical_defense: number;
            mental_willpower: number;
            perception: number;
          };
          species_info: {
            species_name: string;
            current_age: number;
            expected_lifespan: number;
            size_category: "소형종" | "표준형" | "대형종" | "거대형";
          };
          linguistic_profile: {
            speech_style: string;
            sentence_ending: string;
            honorific_rules: string;
            vocal_tics: string;
            evasion_style: string;
            forbidden_words: string[];
          };
          taste_preferences: unknown[];
          decay_rate_negative: number;
          camaraderie_threshold: number;
          // v3 추가
          knowledge_level: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          scenario_id: string;
          session_id?: string | null;
          name: string;
          role: string;
          mbti?: string | null;
          enneagram?: number | null;
          dnd_alignment?: string | null;
          appearance?: string | null;
          personality?: string | null;
          hidden_motivation?: Record<string, unknown>;
          system_prompt: string;
          stats?: Record<string, unknown>;
          // v2 추가
          resistance_stats?: {
            physical_defense?: number;
            mental_willpower?: number;
            perception?: number;
          };
          species_info?: {
            species_name?: string;
            current_age?: number;
            expected_lifespan?: number;
            size_category?: "소형종" | "표준형" | "대형종" | "거대형";
          };
          linguistic_profile?: {
            speech_style?: string;
            sentence_ending?: string;
            honorific_rules?: string;
            vocal_tics?: string;
            evasion_style?: string;
            forbidden_words?: string[];
          };
          taste_preferences?: unknown[];
          decay_rate_negative?: number;
          camaraderie_threshold?: number;
          // v3 추가
          knowledge_level?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["NPC_Persona"]["Insert"]>;
        Relationships: [];
      };

      Game_Session: {
        Row: {
          id: string;
          scenario_id: string;
          room_name: string;
          status: string;
          current_turn_player_id: string | null;
          turn_order: unknown[];
          turn_number: number;
          timeout_at: string | null;
          turn_duration_seconds: number;
          max_players: number;
          host_player_id: string | null;
          // v2 추가
          turn_state: "waiting" | "player_turn" | "npc_turn" | "timeout_resolving";
          npc_dynamic_states: Record<string, unknown>;
          pending_lore_queue: string[];
          session_environment: {
            weather: string;
            time_of_day: string;
          };
          quest_tracker: QuestTracker | null;
          scene_phase: ScenePhase;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scenario_id: string;
          room_name: string;
          status?: string;
          current_turn_player_id?: string | null;
          turn_order?: unknown[];
          turn_number?: number;
          timeout_at?: string | null;
          turn_duration_seconds?: number;
          max_players?: number;
          host_player_id?: string | null;
          // v2 추가
          turn_state?: "waiting" | "player_turn" | "npc_turn" | "timeout_resolving";
          npc_dynamic_states?: Record<string, unknown>;
          pending_lore_queue?: string[];
          session_environment?: {
            weather?: string;
            time_of_day?: string;
          };
          quest_tracker?: QuestTracker | null;
          scene_phase?: ScenePhase;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["Game_Session"]["Insert"]>;
        Relationships: [];
      };

      Player_Character: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          player_name: string;
          character_name: string;
          job: string;
          mbti: string | null;
          enneagram: number | null;
          dnd_alignment: string | null;
          personality_summary: string | null;
          stats: Record<string, unknown>;
          inventory: unknown[];
          is_active: boolean;
          // v2 추가
          species_info: {
            species_name: string;
            current_age: number;
            expected_lifespan: number;
            size_category: "소형종" | "표준형" | "대형종" | "거대형";
          };
          base_modifiers: {
            strength: number;
            dexterity: number;
            charisma: number;
            intelligence: number;
            constitution: number;
          };
          equipped_items: unknown[];
          status_effects: unknown[];
          joined_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_id: string;
          player_name: string;
          character_name: string;
          job: string;
          mbti?: string | null;
          enneagram?: number | null;
          dnd_alignment?: string | null;
          personality_summary?: string | null;
          stats?: Record<string, unknown>;
          inventory?: unknown[];
          is_active?: boolean;
          // v2 추가
          species_info?: {
            species_name?: string;
            current_age?: number;
            expected_lifespan?: number;
            size_category?: "소형종" | "표준형" | "대형종" | "거대형";
          };
          base_modifiers?: {
            strength?: number;
            dexterity?: number;
            charisma?: number;
            intelligence?: number;
            constitution?: number;
          };
          equipped_items?: unknown[];
          status_effects?: unknown[];
          joined_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["Player_Character"]["Insert"]>;
        Relationships: [];
      };

      Action_Log: {
        Row: {
          id: string;
          session_id: string;
          turn_number: number;
          speaker_type: string;
          speaker_id: string | null;
          speaker_name: string;
          action_type: string;
          content: string;
          outcome: string | null;
          state_changes: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          turn_number: number;
          speaker_type: string;
          speaker_id?: string | null;
          speaker_name: string;
          action_type: string;
          content: string;
          outcome?: string | null;
          state_changes?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["Action_Log"]["Insert"]>;
        Relationships: [];
      };

      Session_Memory: {
        Row: {
          id: string;
          session_id: string;
          summary_text: string;
          last_summarized_turn: number;
          key_facts: string[];
          // v2 추가
          npc_id: string | null;       // null = 전역 세션 요약, 값 있음 = NPC별 주관적 기억
          emotional_tags: Record<string, number>; // { anger: 80, humiliation: 50 }
          is_core_memory: boolean;     // true이면 망각 계수 λ=0
          created_at_turn: number;     // 지연 연산 Δt 계산용 턴 번호
          decayed_emotion_level: number; // 에빙하우스 감쇠 적용 후 감정 강도 (0~100)
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          summary_text: string;
          last_summarized_turn?: number;
          key_facts?: string[];
          // v2 추가
          npc_id?: string | null;
          emotional_tags?: Record<string, number>;
          is_core_memory?: boolean;
          created_at_turn?: number;
          decayed_emotion_level?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["Session_Memory"]["Insert"]>;
        Relationships: [];
      };
      World_Dictionary: {
        Row: {
          id: string;
          scenario_id: string;
          domain: "WORLD_LORE" | "PERSONAL_LORE";
          category: string;
          owner_npc_id: string | null;
          trigger_keywords: string[];
          cluster_tags: string[];
          lore_text: string;
          importance_weight: number;
          required_access_level: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scenario_id: string;
          domain: "WORLD_LORE" | "PERSONAL_LORE";
          category: string;
          owner_npc_id?: string | null;
          trigger_keywords?: string[];
          cluster_tags?: string[];
          lore_text: string;
          importance_weight?: number;
          required_access_level?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["World_Dictionary"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
