-- ============================================================
-- NPC 등장 타이밍 제어: is_introduced 컬럼 추가
-- ============================================================
-- false: 아직 이야기 속에서 플레이어와 만나지 않은 NPC
-- true : 이미 GM 서사를 통해 소개된 NPC (대화/반응 가능)
-- ally 역할 NPC는 게임 시작 시 true로 초기화 (처음부터 동행)

ALTER TABLE "NPC_Persona"
  ADD COLUMN IF NOT EXISTS is_introduced BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN "NPC_Persona".is_introduced IS
  '플레이어에게 이미 소개된 NPC 여부. false이면 GM 서사로 소개되기 전까지 반응 불가.';
