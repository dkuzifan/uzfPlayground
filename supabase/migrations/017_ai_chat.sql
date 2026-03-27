-- AI 채팅 피처: AI_Character + AI_Chat_Message 테이블

CREATE TABLE IF NOT EXISTS "AI_Character" (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id      text NOT NULL,
  name          text NOT NULL,
  bio           text,
  personality   text NOT NULL,
  creator_bio   text,
  is_public     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_character_local_id
  ON "AI_Character" (local_id);

CREATE INDEX IF NOT EXISTS idx_ai_character_public
  ON "AI_Character" (is_public) WHERE is_public = true;

CREATE TABLE IF NOT EXISTS "AI_Chat_Message" (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id    uuid NOT NULL REFERENCES "AI_Character"(id) ON DELETE CASCADE,
  local_id        text NOT NULL,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL,
  inner_monologue text,
  emotion_state   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_message_lookup
  ON "AI_Chat_Message" (character_id, local_id, created_at DESC);

-- DOWN:
-- DROP TABLE IF EXISTS "AI_Chat_Message";
-- DROP TABLE IF EXISTS "AI_Character";
