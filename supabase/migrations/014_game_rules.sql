-- ============================================================
-- Phase 1: 게임 룰 레이어 — 정보 구조 규칙
-- ============================================================
-- Action_Log에 is_private 추가: true이면 speaker 본인에게만 표시
-- Scenario에 game_rules 추가: 시나리오별 게임 규칙 설정

ALTER TABLE "Action_Log"
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN "Action_Log".is_private IS
  '비공개 정보 여부. true이면 해당 로그는 speaker_id 본인에게만 표시됨.';

ALTER TABLE "Scenario"
  ADD COLUMN IF NOT EXISTS game_rules JSONB;

COMMENT ON COLUMN "Scenario".game_rules IS
  '시나리오별 게임 룰 설정. info_rules(정보 공개 규칙) 등 포함.
   예: { "info_rules": { "use_private_info": true } }';
