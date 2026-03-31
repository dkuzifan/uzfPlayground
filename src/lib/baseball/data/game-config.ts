export type GameMode     = 'manager' | 'simulation'
export type ProgressUnit = 'at_bat' | 'pitch'
export type HomeSide     = 'home' | 'away'

export interface GameConfig {
  myTeamId:     string
  oppTeamId:    string
  stadiumId:    string
  homeSide:     HomeSide
  gameMode:     GameMode
  progressUnit: ProgressUnit
}

export const GAME_CONFIG_KEY = 'baseball_game_config'

export function saveGameConfig(cfg: GameConfig): void {
  try {
    localStorage.setItem(GAME_CONFIG_KEY, JSON.stringify(cfg))
  } catch {}
}

export function loadGameConfig(): GameConfig | null {
  try {
    const raw = localStorage.getItem(GAME_CONFIG_KEY)
    return raw ? (JSON.parse(raw) as GameConfig) : null
  } catch {
    return null
  }
}
