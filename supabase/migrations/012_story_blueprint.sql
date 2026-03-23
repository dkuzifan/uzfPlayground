-- ============================================================
-- Story Blueprint: GM이 게임 시작 시 생성하는 4막 이야기 설계도
-- ============================================================

ALTER TABLE "Game_Session"
  ADD COLUMN IF NOT EXISTS story_blueprint JSONB DEFAULT NULL;

COMMENT ON COLUMN "Game_Session".story_blueprint IS
  '게임 시작 시 AI가 생성하는 4막 이야기 설계도. 각 막별 등장 NPC, 핵심 이벤트, 톤 지침 포함.';
