import type { GameEvent } from './types'
import type { PitchType, Position } from '../types/player'
import type { AtBatResult } from '../batting/types'
import type { BallType } from '../defence/types'

// ============================================================
// 포지션 한국어
// ============================================================

const POSITION_KO: Partial<Record<Position, string>> = {
  P:    '투수',
  C:    '포수',
  '1B': '1루수',
  '2B': '2루수',
  '3B': '3루수',
  SS:   '유격수',
  LF:   '좌익수',
  CF:   '중견수',
  RF:   '우익수',
  DH:   '지명타자',
}

// theta_h → 방향 레이블 (0°=중견수, +=우측, -=좌측)
function directionLabel(theta: number): string {
  const abs = Math.abs(theta)
  if (abs > 45) return theta < 0 ? '좌측 파울 지역' : '우측 파울 지역'
  if (abs >= 28) return theta < 0 ? '좌측 선상' : '우측 선상'
  if (abs >= 10) return theta < 0 ? '좌중간' : '우중간'
  return '중'
}

function posKo(position: Position | undefined): string {
  return (position && POSITION_KO[position]) ?? ''
}

// ============================================================
// 구종 한국어
// ============================================================

const PITCH_TYPE_KO: Record<PitchType, string> = {
  fastball:  '포심패스트볼',
  sinker:    '싱커',
  cutter:    '커터',
  slider:    '슬라이더',
  curveball: '커브',
  changeup:  '체인지업',
  splitter:  '스플리터',
  forkball:  '포크볼',
}

// ============================================================
// pitchToText — 투구 한 줄 텍스트
// ============================================================

export function pitchToText(ev: GameEvent): string {
  const p = ev.payload as {
    pitch:      { pitch_type: PitchType; delivery_time: number; is_strike: boolean }
    swing:      boolean
    contact:    boolean | null
    is_foul:    boolean | null
    next_count: { balls: number; strikes: number }
  }

  const typeName = PITCH_TYPE_KO[p.pitch.pitch_type] ?? p.pitch.pitch_type
  // delivery_time (s) → km/h: 18.44m / t * 3.6
  const kmh = p.pitch.delivery_time
    ? `${Math.round(18.44 / p.pitch.delivery_time * 3.6)}km`
    : ''

  if ((p as { is_foul_tip?: boolean }).is_foul_tip) return `파울팁 삼진 — ${kmh} ${typeName}`
  if ((p as { foul_fly_error?: boolean }).foul_fly_error) return `파울 플라이 에러 — ${kmh} ${typeName}`
  if (p.is_foul)             return `파울 — ${kmh} ${typeName}`
  if (p.contact === true)    return `컨택 — ${kmh} ${typeName}`
  if (p.swing && !p.contact) return `헛스윙 — ${kmh} ${typeName}`
  if (p.pitch.is_strike)     return `스트라이크 — ${kmh} ${typeName}`
  return `볼 — ${kmh} ${typeName}`
}

// ============================================================
// pitchToLabel — 짧은 레이블 (PBP 컬러 원 옆)
// ============================================================

export function pitchToLabel(ev: GameEvent): { label: string; colorKey: 'ball' | 'strike' | 'foul' | 'inplay' } {
  const p = ev.payload as {
    pitch:   { is_strike: boolean }
    swing:   boolean
    contact: boolean | null
    is_foul: boolean | null
  }

  if (p.is_foul)             return { label: '파울',      colorKey: 'foul'   }
  if (p.contact === true)    return { label: '컨택',      colorKey: 'inplay' }
  if (p.swing && !p.contact) return { label: '헛스윙',    colorKey: 'strike' }
  if (p.pitch.is_strike)     return { label: '스트라이크', colorKey: 'strike' }
  return                            { label: '볼',         colorKey: 'ball'   }
}

// ============================================================
// atBatResultToText — 타석 결과 텍스트
// ============================================================

const AT_BAT_RESULT_KO: Record<AtBatResult, { title: string; sub?: string }> = {
  in_progress:     { title: '타석 진행 중' },
  strikeout:       { title: '삼진 아웃',    sub: '삼진 아웃'     },
  walk:            { title: '볼넷',          sub: '볼넷 출루'     },
  hit_by_pitch:    { title: '사구',          sub: '사구 출루'     },
  single:          { title: '안타',          sub: '안타'          },
  double:          { title: '2루타',         sub: '2루타'         },
  triple:          { title: '3루타',         sub: '3루타'         },
  home_run:        { title: '홈런',          sub: '홈런'          },
  out:             { title: '아웃',          sub: '인플레이 아웃' },  // fallback; see atBatResultToText
  double_play:     { title: '병살타',        sub: '병살 (2아웃)'  },
  fielders_choice: { title: '야수 선택',     sub: '야수 선택'     },
  reach_on_error:  { title: '실책',          sub: '실책 출루'     },
  pickoff_out:     { title: '견제 아웃',     sub: '견제 성공'     },
  caught_stealing: { title: '도루 실패',     sub: '도루 실패'     },
}

const BALL_TYPE_OUT_SUB: Record<BallType, string> = {
  grounder:   '땅볼 아웃',
  fly:        '플라이 아웃',
  popup:      '팝업 아웃',
  line_drive: '라인드라이브 아웃',
}

export function atBatResultToText(ev: GameEvent): { title: string; sub?: string } {
  const p = ev.payload as {
    result:     AtBatResult
    ball_type?: BallType
    fielder?:   { position_1?: Position }
    theta_h?:   number
  }

  const pos    = p.fielder?.position_1
  const pName  = posKo(pos)
  const dir    = p.theta_h !== undefined ? directionLabel(p.theta_h) : ''
  const isInfield = pos !== undefined && ['P', 'C', '1B', '2B', '3B', 'SS'].includes(pos)

  // ── 파울 플라이 아웃 ────────────────────────────────────────
  if (p.result === 'out' && (p as { is_foul_fly?: boolean }).is_foul_fly) {
    const sub = pName ? `${pName} 파울 플라이 아웃` : '파울 플라이 아웃'
    return { title: '아웃', sub }
  }

  // ── 파울팁 삼진 ──────────────────────────────────────────
  if (p.result === 'strikeout' && (p as { is_foul_tip?: boolean }).is_foul_tip) {
    return { title: '삼진 아웃', sub: '파울팁 삼진' }
  }

  // ── 아웃 ──────────────────────────────────────────────────
  if (p.result === 'out' && p.ball_type) {
    let sub: string
    switch (p.ball_type) {
      case 'grounder':
        sub = pName ? `${pName} 땅볼 아웃` : '땅볼 아웃'
        break
      case 'popup':
        sub = pName ? `${pName} 팝업 아웃` : '팝업 아웃'
        break
      case 'line_drive':
        sub = dir ? `${dir} 라인드라이브 아웃` : '라인드라이브 아웃'
        break
      case 'fly':
      default:
        sub = (dir && pName) ? `${dir} ${pName} 플라이 아웃`
            : pName           ? `${pName} 플라이 아웃`
            : dir             ? `${dir} 플라이 아웃`
            : '플라이 아웃'
    }
    return { title: '아웃', sub }
  }

  // ── 안타 계열 ─────────────────────────────────────────────
  if (p.result === 'single') {
    const sub = isInfield
      ? (pName ? `${pName} 내야 안타` : '내야 안타')
      : (dir   ? `${dir} 안타`        : '안타')
    return { title: '안타', sub }
  }
  if (p.result === 'double')   return { title: '2루타',  sub: dir ? `${dir} 2루타`  : '2루타'  }
  if (p.result === 'triple')   return { title: '3루타',  sub: dir ? `${dir} 3루타`  : '3루타'  }
  if (p.result === 'home_run') return { title: '홈런',   sub: dir ? `${dir} 홈런`   : '홈런'   }

  // ── 실책 ─────────────────────────────────────────────────
  if (p.result === 'reach_on_error') {
    return { title: '실책', sub: pName ? `${pName} 실책 출루` : '실책 출루' }
  }

  return AT_BAT_RESULT_KO[p.result] ?? { title: p.result }
}

// 안타 계열 여부
export function isHitResult(result: AtBatResult): boolean {
  return ['single', 'double', 'triple', 'home_run'].includes(result)
}

// ============================================================
// stealResultToText — 도루 성공 텍스트
// ============================================================

export function stealResultToText(ev: GameEvent): string {
  const p = ev.payload as { runner: { name: string }; from: 1|2; to: 2|3|'home' }
  const toStr = p.to === 'home' ? '홈' : `${p.to}루`
  return `도루 성공 — ${p.runner.name} (${p.from}루→${toStr})`
}

// ============================================================
// runnerOutToText — 진루 중 아웃 텍스트
// ============================================================

export function runnerOutToText(ev: GameEvent): string {
  const p = ev.payload as { runner: { name: string }; from: 1|2|3; to: 1|2|3|'home' }
  const toStr = p.to === 'home' ? '홈' : `${p.to}루`
  return `진루 아웃 — ${p.runner.name} (${p.from}루→${toStr})`
}

// ============================================================
// sacFlyToText — 희생플라이 텍스트
// ============================================================

export function sacFlyToText(): string {
  return '희생플라이'
}

// ============================================================
// pitchingChangeToText
// ============================================================

export function pitchingChangeToText(ev: GameEvent): string {
  const p = ev.payload as { incoming: { name: string } }
  return `투수 교체 → ${p.incoming.name}`
}
