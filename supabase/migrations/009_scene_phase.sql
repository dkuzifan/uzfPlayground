-- 009_scene_phase.sql
-- Game_Session에 씬 페이즈 컬럼 추가

ALTER TABLE "Game_Session"
  ADD COLUMN IF NOT EXISTS scene_phase TEXT DEFAULT 'exploration';
