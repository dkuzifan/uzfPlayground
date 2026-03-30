-- baseball_teams 테이블
CREATE TABLE IF NOT EXISTS baseball_teams (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  short_name   TEXT NOT NULL,
  primary_color TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- baseball_players 테이블
CREATE TABLE IF NOT EXISTS baseball_players (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  number       INT,
  age          INT,
  bats         TEXT,           -- 'L' | 'R' | 'S'
  throws       TEXT,           -- 'L' | 'R'
  position_1   TEXT NOT NULL,  -- 주 포지션 (필수)
  position_2   TEXT,           -- 서브 포지션
  position_3   TEXT,           -- 서브 포지션
  stats        JSONB NOT NULL,
  pitch_types  JSONB NOT NULL DEFAULT '[]',
  zone_bottom  NUMERIC,        -- 스트라이크 존 하단 (m)
  zone_top     NUMERIC,        -- 스트라이크 존 상단 (m)
  portrait_url TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_baseball_players_team_id ON baseball_players(team_id);
