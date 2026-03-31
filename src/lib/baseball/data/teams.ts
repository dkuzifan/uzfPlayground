import type { Player, Team } from '../types/player'

// ============================================================
// 시즌 스탯 (프리게임 화면 표시용 — 엔진과 무관)
// ============================================================

export interface PitcherSeasonStats { era: number; whip: number }
export interface BatterSeasonStats  { avg: number; ops: number  }

export interface PlayerWithStats extends Player {
  pitcherSeason?: PitcherSeasonStats
  batterSeason?:  BatterSeasonStats
}

export interface TeamWithStats extends Omit<Team, 'players'> {
  players: PlayerWithStats[]
  bullpen: PlayerWithStats[]
}

// ============================================================
// 헬퍼
// ============================================================

function makePitcher(
  id: string, teamId: string, name: string, num: number,
  control: number, stamina: number,
  season: PitcherSeasonStats,
): PlayerWithStats {
  return {
    id, team_id: teamId, name, number: num,
    age: 28, bats: 'R', throws: 'R',
    position_1: 'P', position_2: null, position_3: null,
    stats: {
      ball_power: 75, ball_control: control, ball_break: 65, ball_speed: 80,
      contact: 0, power: 0, defence: 0, throw: 0, running: 0, stamina,
    },
    pitch_types: [
      { type: 'fastball',  weight: 40, ball_power: 80, ball_control: control,      ball_break: 20, ball_speed: 88 },
      { type: 'slider',    weight: 30, ball_power: 65, ball_control: control - 5,  ball_break: 80, ball_speed: 72 },
      { type: 'changeup',  weight: 20, ball_power: 60, ball_control: control,      ball_break: 65, ball_speed: 64 },
      { type: 'curveball', weight: 10, ball_power: 55, ball_control: control - 10, ball_break: 88, ball_speed: 60 },
    ],
    zone_bottom: 0.55, zone_top: 1.20, portrait_url: null,
    pitcherSeason: season,
  }
}

function makeBatter(
  id: string, teamId: string, name: string, num: number,
  pos: Player['position_1'], contact: number, power: number, running: number,
  season: BatterSeasonStats,
): PlayerWithStats {
  return {
    id, team_id: teamId, name, number: num,
    age: 27, bats: 'R', throws: 'R',
    position_1: pos, position_2: null, position_3: null,
    stats: {
      ball_power: 0, ball_control: 0, ball_break: 0, ball_speed: 0,
      contact, power, defence: 70, throw: 65, running, stamina: 100,
    },
    pitch_types: [],
    zone_bottom: 0.55, zone_top: 1.20, portrait_url: null,
    batterSeason: season,
  }
}

function makeCatcher(
  id: string, teamId: string, name: string, num: number,
  season: BatterSeasonStats,
): PlayerWithStats {
  return {
    id, team_id: teamId, name, number: num,
    age: 29, bats: 'R', throws: 'R',
    position_1: 'C', position_2: null, position_3: null,
    stats: {
      ball_power: 0, ball_control: 0, ball_break: 0, ball_speed: 0,
      contact: 65, power: 60, defence: 72, throw: 75, running: 55, stamina: 100,
    },
    pitch_types: [],
    zone_bottom: 0.55, zone_top: 1.20, portrait_url: null,
    batterSeason: season,
  }
}

// ============================================================
// 팀 데이터
// ============================================================

const seoul: TeamWithStats = {
  id: 'seoul', name: '서울 블루스', short_name: 'SB', primary_color: '#1d4ed8',
  players: [
    makePitcher('sb-sp', 'seoul', '김선발', 11, 72, 100, { era: 3.24, whip: 1.18 }),
    makeCatcher('sb-c',  'seoul', '이포수',  2,           { avg: .268, ops: .741 }),
    makeBatter('sb-1b',  'seoul', '박일루',  5, '1B', 74, 72, 70, { avg: .315, ops: .924 }),
    makeBatter('sb-2b',  'seoul', '최이루',  4, '2B', 68, 62, 78, { avg: .241, ops: .665 }),
    makeBatter('sb-3b',  'seoul', '강삼루',  3, '3B', 70, 68, 72, { avg: .274, ops: .776 }),
    makeBatter('sb-ss',  'seoul', '정유격',  7, 'SS', 66, 60, 80, { avg: .247, ops: .693 }),
    makeBatter('sb-lf',  'seoul', '조좌익',  8, 'LF', 65, 64, 74, { avg: .233, ops: .641 }),
    makeBatter('sb-cf',  'seoul', '윤중견',  9, 'CF', 72, 60, 88, { avg: .301, ops: .812 }),
    makeBatter('sb-rf',  'seoul', '임우익',  6, 'RF', 67, 65, 73, { avg: .259, ops: .728 }),
    makeBatter('sb-dh',  'seoul', '한지명',  1, 'DH', 71, 76, 65, { avg: .288, ops: .897 }),
  ],
  bullpen: [
    makePitcher('sb-rp1', 'seoul', '서불펜1', 21, 58, 65, { era: 4.12, whip: 1.38 }),
    makePitcher('sb-rp2', 'seoul', '서불펜2', 22, 52, 60, { era: 4.85, whip: 1.52 }),
  ],
}

const busan: TeamWithStats = {
  id: 'busan', name: '부산 레즈', short_name: 'BR', primary_color: '#dc2626',
  players: [
    makePitcher('br-sp', 'busan', '나선발', 15, 68, 100, { era: 3.61, whip: 1.24 }),
    makeCatcher('br-c',  'busan', '도포수',  2,           { avg: .254, ops: .712 }),
    makeBatter('br-1b',  'busan', '마일루',  5, '1B', 76, 74, 68, { avg: .322, ops: .948 }),
    makeBatter('br-2b',  'busan', '바이루',  4, '2B', 69, 63, 80, { avg: .255, ops: .698 }),
    makeBatter('br-3b',  'busan', '사삼루',  3, '3B', 71, 70, 71, { avg: .281, ops: .801 }),
    makeBatter('br-ss',  'busan', '아유격',  7, 'SS', 68, 61, 82, { avg: .263, ops: .718 }),
    makeBatter('br-lf',  'busan', '자좌익',  8, 'LF', 67, 66, 75, { avg: .249, ops: .672 }),
    makeBatter('br-cf',  'busan', '차중견',  9, 'CF', 73, 62, 86, { avg: .308, ops: .835 }),
    makeBatter('br-rf',  'busan', '카우익',  6, 'RF', 68, 67, 74, { avg: .267, ops: .744 }),
    makeBatter('br-dh',  'busan', '타지명',  1, 'DH', 72, 78, 63, { avg: .295, ops: .914 }),
  ],
  bullpen: [
    makePitcher('br-rp1', 'busan', '부불펜1', 21, 55, 65, { era: 4.44, whip: 1.41 }),
    makePitcher('br-rp2', 'busan', '부불펜2', 22, 50, 60, { era: 5.01, whip: 1.58 }),
  ],
}

const incheon: TeamWithStats = {
  id: 'incheon', name: '인천 골든스', short_name: 'IG', primary_color: '#d97706',
  players: [
    makePitcher('ig-sp', 'incheon', '파선발', 17, 70, 100, { era: 3.45, whip: 1.21 }),
    makeCatcher('ig-c',  'incheon', '하포수',  2,            { avg: .271, ops: .748 }),
    makeBatter('ig-1b',  'incheon', '거일루',  5, '1B', 73, 71, 69, { avg: .309, ops: .901 }),
    makeBatter('ig-2b',  'incheon', '너이루',  4, '2B', 67, 61, 79, { avg: .244, ops: .671 }),
    makeBatter('ig-3b',  'incheon', '더삼루',  3, '3B', 69, 67, 73, { avg: .277, ops: .783 }),
    makeBatter('ig-ss',  'incheon', '러유격',  7, 'SS', 65, 58, 83, { avg: .251, ops: .689 }),
    makeBatter('ig-lf',  'incheon', '머좌익',  8, 'LF', 66, 63, 76, { avg: .239, ops: .652 }),
    makeBatter('ig-cf',  'incheon', '버중견',  9, 'CF', 71, 59, 87, { avg: .295, ops: .807 }),
    makeBatter('ig-rf',  'incheon', '서우익',  6, 'RF', 66, 64, 72, { avg: .256, ops: .719 }),
    makeBatter('ig-dh',  'incheon', '어지명',  1, 'DH', 70, 75, 64, { avg: .283, ops: .882 }),
  ],
  bullpen: [
    makePitcher('ig-rp1', 'incheon', '인불펜1', 21, 57, 65, { era: 4.28, whip: 1.39 }),
    makePitcher('ig-rp2', 'incheon', '인불펜2', 22, 51, 60, { era: 4.92, whip: 1.55 }),
  ],
}

const daegu: TeamWithStats = {
  id: 'daegu', name: '대구 퍼플스', short_name: 'DP', primary_color: '#7c3aed',
  players: [
    makePitcher('dp-sp', 'daegu', '권선발', 18, 65, 100, { era: 4.07, whip: 1.31 }),
    makeCatcher('dp-c',  'daegu', '오포수',  2,           { avg: .261, ops: .718 }),
    makeBatter('dp-1b',  'daegu', '장일루',  5, '1B', 71, 69, 67, { avg: .279, ops: .856 }),
    makeBatter('dp-2b',  'daegu', '문이루',  4, '2B', 66, 60, 77, { avg: .229, ops: .628 }),
    makeBatter('dp-3b',  'daegu', '남삼루',  3, '3B', 68, 65, 70, { avg: .265, ops: .749 }),
    makeBatter('dp-ss',  'daegu', '류유격',  7, 'SS', 67, 59, 81, { avg: .294, ops: .788 }),
    makeBatter('dp-lf',  'daegu', '신좌익',  8, 'LF', 64, 62, 74, { avg: .244, ops: .681 }),
    makeBatter('dp-cf',  'daegu', '황중견',  9, 'CF', 70, 58, 85, { avg: .238, ops: .655 }),
    makeBatter('dp-rf',  'daegu', '변우익',  6, 'RF', 65, 63, 71, { avg: .251, ops: .703 }),
    makeBatter('dp-dh',  'daegu', '고지명',  1, 'DH', 69, 73, 62, { avg: .308, ops: .911 }),
  ],
  bullpen: [
    makePitcher('dp-rp1', 'daegu', '대불펜1', 31, 54, 65, { era: 4.67, whip: 1.46 }),
    makePitcher('dp-rp2', 'daegu', '대불펜2', 32, 48, 60, { era: 5.18, whip: 1.61 }),
  ],
}

export const TEAMS: TeamWithStats[] = [seoul, busan, incheon, daegu]

export function getTeamById(id: string): TeamWithStats | undefined {
  return TEAMS.find(t => t.id === id)
}
