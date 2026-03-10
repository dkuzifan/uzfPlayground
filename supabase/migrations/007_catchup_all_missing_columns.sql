-- ============================================================
-- 007: 전체 누락 컬럼 보정 (idempotent — 이미 있는 건 무시)
-- migrations 001~006이 부분 적용된 환경을 전체 보정
-- ============================================================

-- uuid-ossp 확장 (이미 있어도 무시)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Scenario
-- ============================================================
CREATE TABLE IF NOT EXISTS "Scenario" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  theme TEXT NOT NULL,
  description TEXT,
  gm_system_prompt TEXT NOT NULL DEFAULT '',
  fixed_truths JSONB DEFAULT '{}',
  clear_conditions JSONB DEFAULT '[]',
  max_players INTEGER NOT NULL DEFAULT 4 CHECK (max_players BETWEEN 1 AND 7),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "Scenario"
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS fixed_truths JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS clear_conditions JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS max_players INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS character_creation_config JSONB NOT NULL DEFAULT '{
    "available_jobs": ["warrior","mage","rogue","cleric","ranger","paladin","bard"],
    "job_labels": {
      "warrior": "전사", "mage": "마법사", "rogue": "도적", "cleric": "성직자",
      "ranger": "레인저", "paladin": "팔라딘", "bard": "음유시인"
    },
    "personality_test_theme": "fantasy",
    "character_name_hint": "모험가의 이름을 입력하세요"
  }';

-- ============================================================
-- NPC_Persona
-- ============================================================
CREATE TABLE IF NOT EXISTS "NPC_Persona" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scenario_id UUID NOT NULL REFERENCES "Scenario"(id) ON DELETE CASCADE,
  session_id UUID,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  mbti CHAR(4),
  enneagram INTEGER CHECK (enneagram BETWEEN 1 AND 9),
  dnd_alignment TEXT,
  appearance TEXT,
  personality TEXT,
  hidden_motivation JSONB DEFAULT '{}',
  system_prompt TEXT NOT NULL DEFAULT '',
  stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "NPC_Persona"
  ADD COLUMN IF NOT EXISTS resistance_stats JSONB NOT NULL DEFAULT '{"physical_defense":10,"mental_willpower":10,"perception":10}',
  ADD COLUMN IF NOT EXISTS species_info JSONB NOT NULL DEFAULT '{"species_name":"인간","current_age":30,"expected_lifespan":80,"size_category":"표준형"}',
  ADD COLUMN IF NOT EXISTS linguistic_profile JSONB NOT NULL DEFAULT '{"speech_style":"중립","sentence_ending":"요","formality":"보통"}',
  ADD COLUMN IF NOT EXISTS taste_preferences JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS decay_rate_negative FLOAT NOT NULL DEFAULT 0.05,
  ADD COLUMN IF NOT EXISTS knowledge_level INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS camaraderie_threshold INTEGER NOT NULL DEFAULT 50;

-- ============================================================
-- Game_Session
-- ============================================================
CREATE TABLE IF NOT EXISTS "Game_Session" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scenario_id UUID NOT NULL REFERENCES "Scenario"(id),
  room_name TEXT NOT NULL DEFAULT '(이름 없음)',
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'in_progress', 'completed', 'abandoned')),
  current_turn_player_id UUID,
  turn_order JSONB DEFAULT '[]',
  turn_number INTEGER NOT NULL DEFAULT 0,
  timeout_at TIMESTAMPTZ,
  turn_duration_seconds INTEGER NOT NULL DEFAULT 30,
  max_players INTEGER NOT NULL DEFAULT 4 CHECK (max_players BETWEEN 1 AND 7),
  host_player_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "Game_Session"
  ADD COLUMN IF NOT EXISTS room_name TEXT NOT NULL DEFAULT '(이름 없음)',
  ADD COLUMN IF NOT EXISTS max_players INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS turn_order JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS timeout_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS turn_duration_seconds INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS host_player_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS npc_dynamic_states JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pending_lore_queue JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS session_environment JSONB NOT NULL DEFAULT '{"time_of_day":"낮","weather":"맑음","location":"미정"}',
  ADD COLUMN IF NOT EXISTS quest_tracker JSONB NOT NULL DEFAULT '{"main_quest":null,"side_quests":[]}',
  ADD COLUMN IF NOT EXISTS turn_state TEXT NOT NULL DEFAULT 'waiting';

-- ============================================================
-- Player_Character
-- ============================================================
CREATE TABLE IF NOT EXISTS "Player_Character" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES "Game_Session"(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  player_name TEXT NOT NULL,
  character_name TEXT NOT NULL,
  job TEXT NOT NULL,
  mbti CHAR(4),
  enneagram INTEGER CHECK (enneagram BETWEEN 1 AND 9),
  dnd_alignment TEXT,
  personality_summary TEXT,
  stats JSONB NOT NULL DEFAULT '{"hp":100,"max_hp":100,"attack":10,"defense":10,"speed":10}',
  inventory JSONB DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, user_id)
);

ALTER TABLE "Player_Character"
  ADD COLUMN IF NOT EXISTS mbti CHAR(4),
  ADD COLUMN IF NOT EXISTS enneagram INTEGER,
  ADD COLUMN IF NOT EXISTS dnd_alignment TEXT,
  ADD COLUMN IF NOT EXISTS personality_summary TEXT,
  ADD COLUMN IF NOT EXISTS inventory JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS base_modifiers JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS equipped_items JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS status_effects JSONB NOT NULL DEFAULT '[]';

-- ============================================================
-- Action_Log
-- ============================================================
CREATE TABLE IF NOT EXISTS "Action_Log" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES "Game_Session"(id) ON DELETE CASCADE,
  player_character_id UUID REFERENCES "Player_Character"(id) ON DELETE SET NULL,
  npc_id UUID REFERENCES "NPC_Persona"(id) ON DELETE SET NULL,
  speaker_type TEXT NOT NULL CHECK (speaker_type IN ('player', 'npc', 'gm', 'system')),
  content TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'gm_narration'
    CHECK (action_type IN ('choice', 'free_input', 'gm_narration', 'npc_dialogue', 'system_event')),
  dice_result JSONB DEFAULT NULL,
  turn_number INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Session_Memory
-- ============================================================
CREATE TABLE IF NOT EXISTS "Session_Memory" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES "Game_Session"(id) ON DELETE CASCADE,
  npc_id UUID REFERENCES "NPC_Persona"(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  turn_range_start INTEGER NOT NULL DEFAULT 0,
  turn_range_end INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "Session_Memory"
  ADD COLUMN IF NOT EXISTS npc_id UUID REFERENCES "NPC_Persona"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS emotional_tags JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_core_memory BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at_turn INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decayed_emotion_level FLOAT NOT NULL DEFAULT 1.0;

-- ============================================================
-- World_Dictionary
-- ============================================================
CREATE TABLE IF NOT EXISTS "World_Dictionary" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scenario_id UUID NOT NULL REFERENCES "Scenario"(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT 'WORLD_LORE'
    CHECK (domain IN ('WORLD_LORE', 'PERSONAL_LORE')),
  trigger_keywords JSONB NOT NULL DEFAULT '[]',
  cluster_tags JSONB NOT NULL DEFAULT '[]',
  lore_text TEXT NOT NULL,
  importance_weight FLOAT NOT NULL DEFAULT 1.0,
  required_access_level INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NPC_Persona session_id FK (이미 있으면 무시)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_npc_session'
  ) THEN
    ALTER TABLE "NPC_Persona"
      ADD CONSTRAINT fk_npc_session
      FOREIGN KEY (session_id) REFERENCES "Game_Session"(id) ON DELETE SET NULL;
  END IF;
END $$;
