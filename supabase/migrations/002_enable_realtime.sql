-- ============================================================
-- Supabase Realtime 활성화
-- postgres_changes 이벤트 수신을 위해 필요
-- ============================================================

-- 1. 테이블을 supabase_realtime publication에 등록
--    (등록하지 않으면 .subscribe()는 성공하지만 이벤트를 수신하지 못함)
--    Game_Session은 프로젝트 생성 시 이미 등록된 경우가 있으므로 제외
ALTER PUBLICATION supabase_realtime ADD TABLE "Action_Log";
ALTER PUBLICATION supabase_realtime ADD TABLE "Player_Character";

-- 2. REPLICA IDENTITY FULL 설정
--    UPDATE 이벤트에서 filter(session_id=eq.xxx)가 정상 작동하려면 필요
--    기본값(DEFAULT)은 PK만 포함하여 UPDATE 필터링이 실패할 수 있음
ALTER TABLE "Action_Log" REPLICA IDENTITY FULL;
ALTER TABLE "Game_Session" REPLICA IDENTITY FULL;
ALTER TABLE "Player_Character" REPLICA IDENTITY FULL;
