-- ============================================================
-- TRPG Platform Initial Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. Scenario: 시나리오 마스터 데이터
-- ============================================================
CREATE TABLE IF NOT EXISTS "Scenario" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  theme TEXT NOT NULL,                         -- 'fantasy' | 'mystery' | 'horror' | 'sci-fi'
  description TEXT,
  gm_system_prompt TEXT NOT NULL,              -- 글로벌 GM 프롬프트
  fixed_truths JSONB DEFAULT '{}',             -- 핵심 진실 (세션 시작 시 하드코딩)
  clear_conditions JSONB DEFAULT '[]',         -- 클리어 조건 배열
  max_players INTEGER NOT NULL DEFAULT 4 CHECK (max_players BETWEEN 1 AND 7),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. NPC_Persona: 자동 생성된 NPC 메타데이터
-- ============================================================
CREATE TABLE IF NOT EXISTS "NPC_Persona" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scenario_id UUID NOT NULL REFERENCES "Scenario"(id) ON DELETE CASCADE,
  session_id UUID,                             -- 세션 연결 (후에 FK 추가)
  name TEXT NOT NULL,
  role TEXT NOT NULL,                          -- 'enemy' | 'ally' | 'neutral' | 'boss'
  mbti CHAR(4),
  enneagram INTEGER CHECK (enneagram BETWEEN 1 AND 9),
  dnd_alignment TEXT,                          -- 예: 'lawful-good', 'chaotic-neutral'
  appearance TEXT,
  personality TEXT,
  hidden_motivation JSONB DEFAULT '{}',        -- 숨겨진 동기 (JSON)
  system_prompt TEXT NOT NULL,                 -- NPC 페르소나 지시어
  stats JSONB DEFAULT '{}',                    -- HP, 공격력 등
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. Game_Session: 방(Room) 단위 게임 상태
-- ============================================================
CREATE TABLE IF NOT EXISTS "Game_Session" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scenario_id UUID NOT NULL REFERENCES "Scenario"(id),
  room_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'in_progress', 'completed', 'abandoned')),
  current_turn_player_id UUID,                 -- 현재 턴 유저 ID
  turn_order JSONB DEFAULT '[]',               -- 턴 순서 배열 (player/npc IDs)
  turn_number INTEGER NOT NULL DEFAULT 0,
  timeout_at TIMESTAMPTZ,                      -- 현재 턴 타임아웃 시각
  turn_duration_seconds INTEGER NOT NULL DEFAULT 30,
  max_players INTEGER NOT NULL DEFAULT 4 CHECK (max_players BETWEEN 1 AND 7),
  host_player_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NPC_Persona의 session_id FK (Game_Session 생성 후 추가)
ALTER TABLE "NPC_Persona"
  ADD CONSTRAINT fk_npc_session
  FOREIGN KEY (session_id) REFERENCES "Game_Session"(id) ON DELETE SET NULL;

-- ============================================================
-- 4. Player_Character: 유저 캐릭터 정보
-- ============================================================
CREATE TABLE IF NOT EXISTS "Player_Character" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES "Game_Session"(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,                       -- Supabase Auth user ID
  player_name TEXT NOT NULL,
  character_name TEXT NOT NULL,
  job TEXT NOT NULL,                           -- 'warrior' | 'mage' | 'rogue' | 'cleric' etc.
  mbti CHAR(4),
  enneagram INTEGER CHECK (enneagram BETWEEN 1 AND 9),
  dnd_alignment TEXT,
  personality_summary TEXT,
  stats JSONB NOT NULL DEFAULT '{
    "hp": 100,
    "max_hp": 100,
    "attack": 10,
    "defense": 10,
    "speed": 10
  }',
  inventory JSONB DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, user_id)
);

-- ============================================================
-- 5. Action_Log: 채팅 및 행동 로그
-- ============================================================
CREATE TABLE IF NOT EXISTS "Action_Log" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES "Game_Session"(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  speaker_type TEXT NOT NULL CHECK (speaker_type IN ('player', 'npc', 'gm', 'system')),
  speaker_id UUID,                             -- Player_Character.id 또는 NPC_Persona.id
  speaker_name TEXT NOT NULL,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('choice', 'free_input', 'gm_narration', 'npc_dialogue', 'system_event')),
  content TEXT NOT NULL,                       -- 행동 선언 또는 판정 결과 텍스트
  outcome TEXT,                                -- 'critical_success' | 'success' | 'partial' | 'failure'
  state_changes JSONB DEFAULT '{}',            -- HP 변화 등 상태 변경 데이터
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. Session_Memory: 토큰 관리용 요약 컨텍스트
-- ============================================================
CREATE TABLE IF NOT EXISTS "Session_Memory" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES "Game_Session"(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,                  -- 압축된 스토리 요약 (RAG 컨텍스트)
  last_summarized_turn INTEGER NOT NULL DEFAULT 0,
  key_facts JSONB DEFAULT '[]',                -- 핵심 사실 목록 (영구 기억)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id)
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_npc_persona_scenario ON "NPC_Persona"(scenario_id);
CREATE INDEX idx_npc_persona_session ON "NPC_Persona"(session_id);
CREATE INDEX idx_game_session_status ON "Game_Session"(status);
CREATE INDEX idx_player_character_session ON "Player_Character"(session_id);
CREATE INDEX idx_player_character_user ON "Player_Character"(user_id);
CREATE INDEX idx_action_log_session ON "Action_Log"(session_id);
CREATE INDEX idx_action_log_turn ON "Action_Log"(session_id, turn_number);

-- ============================================================
-- Updated_at auto-update trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_scenario_updated_at
  BEFORE UPDATE ON "Scenario"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_game_session_updated_at
  BEFORE UPDATE ON "Game_Session"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_player_character_updated_at
  BEFORE UPDATE ON "Player_Character"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_session_memory_updated_at
  BEFORE UPDATE ON "Session_Memory"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE "Scenario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NPC_Persona" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Game_Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Player_Character" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Action_Log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session_Memory" ENABLE ROW LEVEL SECURITY;

-- Scenario: 누구나 읽기 가능
CREATE POLICY "scenarios_public_read" ON "Scenario"
  FOR SELECT USING (true);

-- Game_Session: 누구나 읽기, 인증된 사용자 생성
CREATE POLICY "sessions_public_read" ON "Game_Session"
  FOR SELECT USING (true);
CREATE POLICY "sessions_auth_insert" ON "Game_Session"
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Player_Character: 자신의 캐릭터만 수정
CREATE POLICY "pc_public_read" ON "Player_Character"
  FOR SELECT USING (true);
CREATE POLICY "pc_own_insert" ON "Player_Character"
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pc_own_update" ON "Player_Character"
  FOR UPDATE USING (auth.uid() = user_id);

-- Action_Log: 참여 세션 읽기 가능
CREATE POLICY "action_log_session_read" ON "Action_Log"
  FOR SELECT USING (true);

-- NPC_Persona & Session_Memory: 서버 측(서비스 롤)만 쓰기
CREATE POLICY "npc_public_read" ON "NPC_Persona"
  FOR SELECT USING (true);
CREATE POLICY "memory_public_read" ON "Session_Memory"
  FOR SELECT USING (true);
