-- 008_objectives_endings.sql
-- Scenario 테이블에 objectives(목표 설정)와 endings(엔딩 조건) JSONB 컬럼 추가

ALTER TABLE "Scenario"
  ADD COLUMN IF NOT EXISTS objectives jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS endings    jsonb DEFAULT NULL;

COMMENT ON COLUMN "Scenario".objectives IS
  '목표 설정: { primary, secondary[], secret, doom_clock_interval, doom_clock_max }';

COMMENT ON COLUMN "Scenario".endings IS
  '엔딩 조건 목록: { endings: EndingCondition[] }';
