import type { Player } from '../types/player'

// ============================================================
// 1경기 타자 성적
// ============================================================

export interface BatterGameStats {
  player: Player
  AB:  number   // 타수
  H:   number   // 안타
  '2B': number  // 2루타
  '3B': number  // 3루타
  HR:  number   // 홈런
  BB:  number   // 볼넷 (HBP 포함)
  SO:  number   // 삼진
  RBI: number   // 타점
  SB:  number   // 도루 성공
  CS:  number   // 도루 실패
}

// ============================================================
// 1경기 투수 성적
// ============================================================

export interface PitcherGameStats {
  player: Player
  outs:   number   // 내부 이닝 표현 (아웃 수 정수). 표시 시 formatIP() 사용
  H:      number   // 피안타
  ER:     number   // 자책점 (수비 에러 미구현 → 모든 실점을 자책점으로 처리)
  BB:     number   // 볼넷 허용 (HBP 포함)
  SO:     number   // 탈삼진
  W:      boolean  // 승
  L:      boolean  // 패
  SV:     boolean  // 세이브
}

// ============================================================
// 팀/경기 스탯 컨테이너
// ============================================================

export interface TeamGameStats {
  batters:  BatterGameStats[]   // 타순 순서
  pitchers: PitcherGameStats[]  // 등판 순서
}

export interface GameStats {
  home: TeamGameStats
  away: TeamGameStats
}

// ============================================================
// 유틸리티
// ============================================================

/**
 * 아웃 수 → IP 표시 문자열
 * 7 outs → "2.1", 9 outs → "3.0", 0 outs → "0.0"
 */
export function formatIP(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`
}

/**
 * 타자 파생 스탯 계산 (나누기 0 안전)
 */
export function calcBatterDerived(s: BatterGameStats) {
  const AVG = s.AB > 0 ? s.H / s.AB : 0
  const OBP = (s.AB + s.BB) > 0 ? (s.H + s.BB) / (s.AB + s.BB) : 0
  const singles = s.H - s['2B'] - s['3B'] - s.HR
  const SLG = s.AB > 0 ? (singles + 2 * s['2B'] + 3 * s['3B'] + 4 * s.HR) / s.AB : 0
  return { AVG, OBP, SLG, OPS: OBP + SLG }
}

/**
 * 투수 파생 스탯 계산 (나누기 0 안전)
 */
export function calcPitcherDerived(s: PitcherGameStats) {
  const ip   = s.outs / 3
  const ERA  = ip > 0 ? (s.ER * 9) / ip : 0
  const WHIP = ip > 0 ? (s.BB + s.H) / ip : 0
  return { ERA, WHIP, IP: formatIP(s.outs) }
}
