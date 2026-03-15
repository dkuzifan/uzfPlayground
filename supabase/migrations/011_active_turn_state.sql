-- 활성 턴 상태 (선택지 공개 + 주사위 진행 표시용)
ALTER TABLE "Game_Session"
  ADD COLUMN IF NOT EXISTS active_turn_state jsonb;
