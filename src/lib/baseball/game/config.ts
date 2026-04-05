import type { ExtraInningsRule } from './types'

export type FieldersChoiceRule = 'mlb' | 'standard'

export const GAME_CONFIG = {
  max_innings:           9,
  max_innings_hard_cap:  15,   // 무한 루프 방지
  extra_innings_rule:    'max12' as ExtraInningsRule,
  fielders_choice_rule:  'mlb' as FieldersChoiceRule,
}

// 라인 드라이브 판정 기준: 이 미만이면 귀루 아웃 체크 (태그업 없음)
export const LINE_DRIVE_THRESHOLD = 0.8  // s

// 포구 실책: p_error = p_out * ERROR_COEFF
export const ERROR_COEFF = 0.04

// 송구 실책 기본 계수
export const THROW_ERROR_COEFF = 0.03
