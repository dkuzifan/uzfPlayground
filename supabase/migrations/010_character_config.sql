-- 010_character_config.sql
-- Scenario에 캐릭터 설정 (스탯 스키마 + 직업별 기본 스탯) 추가

ALTER TABLE "Scenario"
  ADD COLUMN IF NOT EXISTS character_config jsonb DEFAULT NULL;
