-- ============================================================
-- TRPG Platform Schema v2: NPC 다이내믹 페르소나 시스템
-- ============================================================
-- 추가 내용:
--   NPC_Persona    : 심리 변수, 종족 정보, 언어 프로필, 취향 모디파이어
--   Game_Session   : 턴 상태 머신, NPC 동적 상태, Lore Queue, 환경, 퀘스트 트래커
--   Player_Character: 종족 정보(신장 포함), 기본 보정치, 장착 아이템, 상태 이상
--   Session_Memory : NPC별 주관적 기억 지원 (npc_id, 감정 태그)
-- ============================================================


-- ============================================================
-- 1. NPC_Persona 확장
-- ============================================================

ALTER TABLE "NPC_Persona"

  -- 저항 스탯 (System GM 주사위 판정의 DC 기준값)
  -- physical_defense: 물리 공격/협박 저항
  -- mental_willpower: 설득/유혹/심리전 저항
  -- perception     : 은신/거짓말 탐지
  ADD COLUMN IF NOT EXISTS resistance_stats JSONB NOT NULL DEFAULT '{
    "physical_defense": 10,
    "mental_willpower": 10,
    "perception": 10
  }',

  -- 종족 및 수명 정보 (상대적 연령 인지 연산에 사용)
  -- size_category: '소형종' | '표준형' | '대형종' | '거대형'
  ADD COLUMN IF NOT EXISTS species_info JSONB NOT NULL DEFAULT '{
    "species_name": "인간",
    "current_age": 30,
    "expected_lifespan": 80,
    "size_category": "표준형"
  }',

  -- 언어 프로필 (캐릭터 붕괴 방지, 말투 통제)
  -- speech_style   : 말투 설명 (예: "고풍스럽고 우아한 귀족식 어휘")
  -- sentence_ending: 어미 패턴 (예: "~하오, ~소이다")
  -- honorific_rules: 존댓말/하대 기준 (예: "신뢰도 80 이상일 때만 존댓말")
  -- vocal_tics     : 버릇 묘사 (예: "(코웃음을 치며)")
  -- evasion_style  : 대기열 초과 시 핑계 스타일
  -- forbidden_words: AI가 절대 사용 불가한 단어 목록
  ADD COLUMN IF NOT EXISTS linguistic_profile JSONB NOT NULL DEFAULT '{
    "speech_style": "평범한 구어체",
    "sentence_ending": "",
    "honorific_rules": "상대방의 지위에 따라 존댓말/반말을 구분",
    "vocal_tics": "",
    "evasion_style": "바빠 보이는 척하며 화제를 돌림",
    "forbidden_words": []
  }',

  -- 다차원적 취향 배열 (모디파이어 엔진의 핵심 데이터)
  -- 각 취향 객체 구조:
  --   id              : 고유 식별자 (예: "TASTE_INT_005")
  --   domain          : "interpersonal" | "aesthetic" | "lifestyle"
  --   name            : 취향 명칭
  --   description     : 발동 시 프롬프트에 주입될 묘사 텍스트
  --   trigger_keywords: 발동 트리거 단어 배열
  --   modifiers       : { affinity_multiplier, stress_multiplier, fear_multiplier }
  ADD COLUMN IF NOT EXISTS taste_preferences JSONB NOT NULL DEFAULT '[]',

  -- 망각 계수 (에빙하우스 지수 감쇠 공식의 λ)
  -- 낮을수록 오래 기억(뒤끝 있는 성격), 높을수록 빨리 잊음(낙천적 성격)
  -- 기준: INTJ/에니어그램 4번 → 0.01, ENFP/에니어그램 7번 → 0.1
  ADD COLUMN IF NOT EXISTS decay_rate_negative FLOAT NOT NULL DEFAULT 0.05
    CHECK (decay_rate_negative BETWEEN 0.0 AND 1.0),

  -- 전우애 민감도 (Bond of Hardship 발동 임계값)
  -- 이 수치 이상의 공포/위기를 함께 극복해야 전우애가 형성됨
  ADD COLUMN IF NOT EXISTS camaraderie_threshold INTEGER NOT NULL DEFAULT 50
    CHECK (camaraderie_threshold BETWEEN 0 AND 100);


-- ============================================================
-- 2. Game_Session 확장
-- ============================================================

ALTER TABLE "Game_Session"

  -- 턴 상태 머신 (Notion: 타임아웃 상태 머신 로직)
  -- waiting          : 턴 주인 미결정 또는 연산 준비
  -- player_turn      : 특정 유저에게 발언권 + 타이머 차감
  -- npc_turn         : 백엔드 파이프라인 + AI 답변 생성
  -- timeout_resolving: AFK 감지 후 강제 개입 처리
  ADD COLUMN IF NOT EXISTS turn_state TEXT NOT NULL DEFAULT 'waiting'
    CHECK (turn_state IN ('waiting', 'player_turn', 'npc_turn', 'timeout_resolving')),

  -- NPC별 실시간 동적 심리 상태
  -- 구조: { "npc_uuid": { affinity, trust, mental_stress, fear_survival,
  --                        current_mood, power_dynamics, camaraderie } }
  -- 17개 심리 변수 중 단기 휘발성 변수 + 장기 누적 변수 모두 포함
  ADD COLUMN IF NOT EXISTS npc_dynamic_states JSONB NOT NULL DEFAULT '{}',

  -- 미뤄둔 Lore 키워드 대기열 (Lore Queue & Clustering)
  -- 토큰 초과로 이번 턴에 설명 못 한 키워드 명칭 목록
  -- 예: ["흑마법사", "고블린 촌장"]
  ADD COLUMN IF NOT EXISTS pending_lore_queue JSONB NOT NULL DEFAULT '[]',

  -- 세션 환경 데이터 (다이내믹 DC 보정에 사용)
  -- weather    : 날씨 (예: "폭우", "맑음", "안개") → DC 보정 계산에 사용
  -- time_of_day: 시간대 (예: "심야", "낮", "황혼") → 은신 판정 보정
  ADD COLUMN IF NOT EXISTS session_environment JSONB NOT NULL DEFAULT '{
    "weather": "맑음",
    "time_of_day": "낮"
  }',

  -- 퀘스트 마일스톤 트래커 (Quest Flag Tracking Engine)
  -- status    : "IN_PROGRESS" | "CLEARED" | "FAILED"
  -- milestones: { flag_name: { type: "boolean"|"counter", value, target? } }
  ADD COLUMN IF NOT EXISTS quest_tracker JSONB NOT NULL DEFAULT '{
    "status": "IN_PROGRESS",
    "milestones": {}
  }';


-- ============================================================
-- 3. Player_Character 확장
-- ============================================================

ALTER TABLE "Player_Character"

  -- 종족 및 수명 정보 (NPC와 동일 구조, 상대적 연령 인지 연산에 사용)
  -- size_category 카테고리:
  --   소형종: 고블린, 노움, 코볼트, 하플링 (은신+, 위협-)
  --   표준형: 인간, 엘프, 드워프, 하프엘프, 오크 (기준값)
  --   대형종: 드래곤본, 트롤, 반거인 혼혈 (위협+, 은신-)
  --   거대형: 거인, 보스급 존재 (특수 판정 규칙 적용)
  ADD COLUMN IF NOT EXISTS species_info JSONB NOT NULL DEFAULT '{
    "species_name": "인간",
    "current_age": 25,
    "expected_lifespan": 80,
    "size_category": "표준형"
  }',

  -- 기본 능력치 보정치 (온보딩 성향 테스트 + 종족 특성으로 결정)
  -- Player_Score = D20 + base_stat_bonus + 장비 보정 + 상태 보정
  ADD COLUMN IF NOT EXISTS base_modifiers JSONB NOT NULL DEFAULT '{
    "strength": 0,
    "dexterity": 0,
    "charisma": 0,
    "intelligence": 0,
    "constitution": 0
  }',

  -- 현재 장착 아이템 (다이내믹 DC 보정에 사용)
  -- 구조: [{ name, slot, effect_description, stat_modifier: { dexterity: +3 } }]
  ADD COLUMN IF NOT EXISTS equipped_items JSONB NOT NULL DEFAULT '[]',

  -- 현재 상태 이상 (버프/디버프, 다이내믹 DC 보정에 사용)
  -- 구조: [{ name, type: "buff"|"debuff", effect_description,
  --           stat_modifier: { strength: -2 }, duration_turns }]
  ADD COLUMN IF NOT EXISTS status_effects JSONB NOT NULL DEFAULT '[]';


-- ============================================================
-- 4. Session_Memory 수정: NPC별 주관적 기억 지원
-- ============================================================

-- 기존 UNIQUE(session_id) 제약 제거 → NPC별 다수 기억 허용
ALTER TABLE "Session_Memory"
  DROP CONSTRAINT IF EXISTS "Session_Memory_session_id_key";

-- npc_id: NULL이면 전역 세션 요약, 값이 있으면 NPC별 주관적 기억
ALTER TABLE "Session_Memory"
  ADD COLUMN IF NOT EXISTS npc_id UUID REFERENCES "NPC_Persona"(id) ON DELETE CASCADE,

  -- 감정 태그 (요약 에이전트가 생성하는 NPC 주관적 감정 수치)
  -- 구조: { anger: 80, humiliation: 50, thrill: 20, ... }
  ADD COLUMN IF NOT EXISTS emotional_tags JSONB NOT NULL DEFAULT '{}',

  -- 핵심 기억 여부 (true이면 망각 계수 λ=0, 절대 풍화되지 않음)
  -- NPC의 역린/가치관을 크게 건드린 사건에만 true
  ADD COLUMN IF NOT EXISTS is_core_memory BOOLEAN NOT NULL DEFAULT false,

  -- 기억 생성 시점의 턴 번호 (지연 연산 망각 공식의 Δt 계산에 사용)
  ADD COLUMN IF NOT EXISTS created_at_turn INTEGER NOT NULL DEFAULT 0;

-- 전역 요약은 세션당 1개만 허용 (npc_id IS NULL인 경우에만 unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_memory_global
  ON "Session_Memory"(session_id)
  WHERE npc_id IS NULL;

-- NPC 기억 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_session_memory_npc
  ON "Session_Memory"(session_id, npc_id)
  WHERE npc_id IS NOT NULL;


-- ============================================================
-- 5. 새 인덱스
-- ============================================================

-- NPC 동적 상태 조회 최적화
CREATE INDEX IF NOT EXISTS idx_game_session_turn_state
  ON "Game_Session"(turn_state);

-- NPC 종족 카테고리별 조회 (size_category 필터링)
CREATE INDEX IF NOT EXISTS idx_npc_species_size
  ON "NPC_Persona" ((species_info->>'size_category'));

CREATE INDEX IF NOT EXISTS idx_pc_species_size
  ON "Player_Character" ((species_info->>'size_category'));
