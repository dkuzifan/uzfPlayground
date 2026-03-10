-- ============================================================
-- 006: Game_Session 누락 컬럼 추가
-- 초기 마이그레이션이 부분 적용되어 빠진 컬럼들을 보완
-- ============================================================

ALTER TABLE "Game_Session"
  ADD COLUMN IF NOT EXISTS room_name TEXT NOT NULL DEFAULT '(이름 없음)',
  ADD COLUMN IF NOT EXISTS max_players INTEGER NOT NULL DEFAULT 4
    CHECK (max_players BETWEEN 1 AND 7),
  ADD COLUMN IF NOT EXISTS turn_order JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS timeout_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS turn_duration_seconds INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS host_player_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
