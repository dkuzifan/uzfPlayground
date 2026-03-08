-- ============================================================
-- TRPG Platform Schema v3: World_Dictionary (Lore & Context)
-- ============================================================
-- 세계관/NPC 개인사 지식을 키워드 기반으로 동적 호출하는 테이블.
-- NPC가 알 권한이 있는 정보만 프롬프트에 주입하여
-- AI hallucination을 방지하고 토큰 비용을 최적화합니다.
-- ============================================================


-- ============================================================
-- 1. World_Dictionary 테이블 신규 생성
-- ============================================================
CREATE TABLE IF NOT EXISTS "World_Dictionary" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 어떤 시나리오의 로어인지
  scenario_id UUID NOT NULL REFERENCES "Scenario"(id) ON DELETE CASCADE,

  -- 대분류: 세계관 공통 지식 vs NPC 개인사
  domain TEXT NOT NULL CHECK (domain IN ('WORLD_LORE', 'PERSONAL_LORE')),

  -- 소분류: 지명, 인물, 종족, 마법, 역사 / 가족사, 트라우마 등
  category TEXT NOT NULL,

  -- PERSONAL_LORE일 때만 값 있음 — 누구의 개인사인지 지정
  owner_npc_id UUID REFERENCES "NPC_Persona"(id) ON DELETE CASCADE,

  -- 유저 입력에서 매칭할 키워드 배열 (예: ["세계수", "엘프의 숲"])
  trigger_keywords JSONB NOT NULL DEFAULT '[]',

  -- 태그 군집화용 의미망 태그 (예: ["엘프", "마법"])
  -- 교집합 태그가 있는 항목들은 한 그룹으로 묶여 함께 설명됨
  cluster_tags JSONB NOT NULL DEFAULT '[]',

  -- AI에게 주입될 실제 설정 텍스트 (150자 이내 권장)
  lore_text TEXT NOT NULL,

  -- 우선순위 (1~10) — 여러 그룹 중 무엇을 먼저 설명할지 결정
  importance_weight INTEGER NOT NULL DEFAULT 5
    CHECK (importance_weight BETWEEN 1 AND 10),

  -- 최소 접근 레벨
  --   WORLD_LORE  → NPC의 knowledge_level >= required_access_level
  --   PERSONAL_LORE → 유저와의 trust(신뢰도) >= required_access_level * 10
  required_access_level INTEGER NOT NULL DEFAULT 1
    CHECK (required_access_level BETWEEN 1 AND 10),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Updated_at 트리거
CREATE TRIGGER trg_world_dict_updated_at
  BEFORE UPDATE ON "World_Dictionary"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE "World_Dictionary" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "world_dict_public_read" ON "World_Dictionary"
  FOR SELECT USING (true);


-- ============================================================
-- 2. NPC_Persona에 knowledge_level 추가
-- ============================================================
-- NPC가 세계관 지식에 접근할 수 있는 수준
-- 1 = 평민 상식, 5 = 학자/귀족, 8 = 엘리트 정보망, 10 = 극비 사항 접근 가능
ALTER TABLE "NPC_Persona"
  ADD COLUMN IF NOT EXISTS knowledge_level INTEGER NOT NULL DEFAULT 5
    CHECK (knowledge_level BETWEEN 1 AND 10);


-- ============================================================
-- 3. 인덱스
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_world_dict_scenario
  ON "World_Dictionary"(scenario_id);

CREATE INDEX IF NOT EXISTS idx_world_dict_domain
  ON "World_Dictionary"(domain);

CREATE INDEX IF NOT EXISTS idx_world_dict_owner_npc
  ON "World_Dictionary"(owner_npc_id)
  WHERE owner_npc_id IS NOT NULL;
