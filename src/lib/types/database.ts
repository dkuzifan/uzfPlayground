// ============================================================
// Supabase Database Types (mirrors SQL schema)
// ============================================================

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
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["Scenario"]["Insert"]>;
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
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["NPC_Persona"]["Insert"]>;
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
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["Game_Session"]["Insert"]>;
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
          joined_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["Player_Character"]["Insert"]>;
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
      };

      Session_Memory: {
        Row: {
          id: string;
          session_id: string;
          summary_text: string;
          last_summarized_turn: number;
          key_facts: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          summary_text: string;
          last_summarized_turn?: number;
          key_facts?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["Session_Memory"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
