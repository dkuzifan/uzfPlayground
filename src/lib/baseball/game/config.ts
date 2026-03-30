import type { ExtraInningsRule } from './types'

export const GAME_CONFIG = {
  max_innings:           9,
  max_innings_hard_cap:  30,   // 무한 루프 방지
  extra_innings_rule:    'unlimited' as ExtraInningsRule,
}
