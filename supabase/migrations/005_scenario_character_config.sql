-- ============================================================
-- TRPG Platform Schema v4: 시나리오별 캐릭터 생성 설정
-- ============================================================
-- 온보딩 재설계에 따라 시나리오가 캐릭터 생성 UI를 직접 제어.
-- 직업 목록, 직업 라벨, 성향 테스트 테마, 캐릭터 이름 힌트 포함.
-- ============================================================

ALTER TABLE "Scenario"
  ADD COLUMN IF NOT EXISTS character_creation_config JSONB NOT NULL DEFAULT '{
    "available_jobs": ["warrior", "mage", "rogue", "cleric", "ranger", "paladin", "bard"],
    "job_labels": {
      "warrior":  "전사",
      "mage":     "마법사",
      "rogue":    "도적",
      "cleric":   "성직자",
      "ranger":   "레인저",
      "paladin":  "성기사",
      "bard":     "음유시인"
    },
    "personality_test_theme": "fantasy",
    "character_name_hint": "모험가의 이름을 입력하세요"
  }';
