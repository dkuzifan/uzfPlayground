-- NPC_Persona에 제작자 정의 커스텀 트리거 컬럼 추가
ALTER TABLE "NPC_Persona"
  ADD COLUMN IF NOT EXISTS custom_triggers JSONB DEFAULT NULL;
