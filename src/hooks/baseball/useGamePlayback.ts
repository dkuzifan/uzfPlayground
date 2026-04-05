'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Player } from '@/lib/baseball/types/player'
import type { GameEvent, GameResult } from '@/lib/baseball/game/types'
import type { AtBatResult } from '@/lib/baseball/batting/types'
import type { ProgressUnit } from '@/lib/baseball/data/game-config'
import { deriveState, type LiveGameState } from '@/lib/baseball/game/derive-state'
import {
  pitchToText,
  pitchToLabel,
  atBatResultToText,
  isHitResult,
  pitchingChangeToText,
  stealResultToText,
  runnerOutToText,
} from '@/lib/baseball/game/pbp-text'

// ============================================================
// Types
// ============================================================

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'ended'
export type Speed = 'slow' | 'normal' | 'fast'

const SPEED_MS: Record<Speed, number> = {
  slow:   3000,
  normal: 1500,
  fast:    500,
}

// PBP 렌더링 구조
export interface PitchRow {
  num:      number
  text:     string
  colorKey: 'ball' | 'strike' | 'foul' | 'inplay'
}

export interface ResultRow {
  title: string
  sub?:  string
}

export interface AtBatGroup {
  batterName:  string
  batterOrder: number
  isActive:    boolean
  pitches:     PitchRow[]
  result:      ResultRow | null
  pitchChange: string | null   // 이 타석 앞에 투수 교체가 있었다면
  notes:       string[]        // 도루 성공, 진루 아웃 등 타석 중/후 부가 이벤트
}

export interface PBPGroup {
  inning:   number
  isTop:    boolean
  isActive: boolean
  summary:  string    // 종료 이닝: "1안타 · 0득점"
  atBats:   AtBatGroup[]
}

export interface PlaybackState {
  status:        PlaybackStatus
  revealedCount: number
  speed:         Speed
  liveState:     LiveGameState
  pbpGroups:     PBPGroup[]
  result:        GameResult | null
}

export interface PlaybackActions {
  pause:    () => void
  resume:   () => void
  next:     () => void
  setSpeed: (s: Speed) => void
}

// ============================================================
// nextUnitEnd — 다음 공개 경계 계산
// ============================================================

function nextUnitEnd(events: GameEvent[], from: number, unit: ProgressUnit): number {
  if (unit === 'pitch') return from + 1
  // at_bat: at_bat_result까지 한 번에 공개.
  // 단, 타석 중 steal_attempt가 있으면 steal_result 직후를 먼저 중간 경계로 반환.
  for (let i = from; i < events.length; i++) {
    if (events[i].type === 'steal_attempt') {
      for (let j = i + 1; j < events.length; j++) {
        if (events[j].type === 'steal_result')   return j + 1
        if (events[j].type === 'at_bat_result')  break  // steal_result 없이 at_bat_result 도달
      }
    }
    if (events[i].type === 'at_bat_result') return i + 1
  }
  return events.length
}

// ============================================================
// buildPBPGroups — 공개된 이벤트 → PBPGroup[]
// ============================================================

function buildPBPGroups(
  events:     GameEvent[],
  awayLineup: Player[],
  homeLineup: Player[],
): PBPGroup[] {
  const groups: PBPGroup[] = []

  let awayIdx  = 0
  let homeIdx  = 0
  let pitchNum = 0
  let pendingPitchChange: string | null = null
  let currentGroup: PBPGroup | null    = null
  let currentAtBat: AtBatGroup | null  = null
  let lastAtBat:    AtBatGroup | null  = null  // 직전 완료 타석 (진루 아웃 등 후처리용)

  for (const ev of events) {
    switch (ev.type) {

      case 'inning_start': {
        if (currentGroup) currentGroup.isActive = false
        currentGroup = {
          inning:   ev.inning,
          isTop:    ev.isTop,
          isActive: true,
          summary:  '● 진행 중',
          atBats:   [],
        }
        groups.push(currentGroup)
        currentAtBat = null
        lastAtBat    = null
        pitchNum     = 0
        break
      }

      case 'pitching_change': {
        pendingPitchChange = pitchingChangeToText(ev)
        break
      }

      case 'pitch': {
        if (!currentGroup) break

        if (!currentAtBat) {
          const batting = ev.isTop ? awayLineup : homeLineup
          const idx     = ev.isTop ? awayIdx    : homeIdx
          currentAtBat = {
            batterName:  batting[idx % 9].name,
            batterOrder: (idx % 9) + 1,
            isActive:    true,
            pitches:     [],
            result:      null,
            pitchChange: pendingPitchChange,
            notes:       [],
          }
          pendingPitchChange = null
          currentGroup.atBats.push(currentAtBat)
        }

        pitchNum++
        const { label, colorKey } = pitchToLabel(ev)
        currentAtBat.pitches.push({
          num:      pitchNum,
          text:     pitchToText(ev),
          colorKey,
        })
        break
      }

      case 'at_bat_result': {
        if (!currentGroup) break

        if (!currentAtBat) {
          // 투구 없이 결과가 나오는 엣지 케이스 (ex: HBP 첫 구)
          const batting = ev.isTop ? awayLineup : homeLineup
          const idx     = ev.isTop ? awayIdx    : homeIdx
          currentAtBat = {
            batterName:  batting[idx % 9].name,
            batterOrder: (idx % 9) + 1,
            isActive:    true,
            pitches:     [],
            result:      null,
            pitchChange: pendingPitchChange,
            notes:       [],
          }
          pendingPitchChange = null
          currentGroup.atBats.push(currentAtBat)
        }

        currentAtBat.result   = atBatResultToText(ev)
        currentAtBat.isActive = false
        lastAtBat    = currentAtBat
        currentAtBat = null
        pitchNum     = 0

        if (ev.isTop) awayIdx++
        else          homeIdx++
        break
      }

      case 'steal_result': {
        const p = ev.payload as { success: boolean }
        if (p.success && currentAtBat) {
          currentAtBat.notes.push(stealResultToText(ev))
        }
        break
      }

      case 'runner_out': {
        // 진루 중 아웃 — 직전 타석(lastAtBat) 또는 현재 타석에 추가
        const target = currentAtBat ?? lastAtBat
        if (target) {
          target.notes.push(runnerOutToText(ev))
        }
        break
      }

      case 'inning_end': {
        if (!currentGroup) break
        const p = ev.payload as { runs_this_half: number }
        const hits = currentGroup.atBats.reduce((sum, ab) => {
          if (!ab.result) return sum
          const p2 = ev.payload as { result?: AtBatResult }
          // 안타 계열 타석 결과 카운트
          const titleMap: Record<string, boolean> = {
            '안타': true, '2루타': true, '3루타': true, '홈런': true,
          }
          return sum + (titleMap[ab.result.title] ? 1 : 0)
        }, 0)
        currentGroup.summary  = `${hits}안타 · ${p.runs_this_half}득점`
        currentGroup.isActive = false
        break
      }
    }
  }

  return groups
}

// ============================================================
// useGamePlayback
// ============================================================

export function useGamePlayback(
  gameResult:  GameResult,
  homeLineup:  Player[],
  awayLineup:  Player[],
  homePitcher: Player,
  awayPitcher: Player,
  progressUnit: ProgressUnit,
): PlaybackState & PlaybackActions {
  const events = gameResult.events

  const [status,        setStatus]        = useState<PlaybackStatus>('playing')
  const [revealedCount, setRevealedCount] = useState<number>(0)
  const [speed,         setSpeedState]    = useState<Speed>('normal')

  // interval ref — status/speed 변경 시 재설정
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const advance = useCallback(() => {
    setRevealedCount(prev => {
      if (prev >= events.length) return prev
      const next = nextUnitEnd(events, prev, progressUnit)
      return Math.min(next, events.length)
    })
  }, [events, progressUnit])

  // 자동 재생
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)

    if (status === 'playing') {
      intervalRef.current = setInterval(() => {
        setRevealedCount(prev => {
          if (prev >= events.length) {
            setStatus('ended')
            return prev
          }
          const next = nextUnitEnd(events, prev, progressUnit)
          return Math.min(next, events.length)
        })
      }, SPEED_MS[speed])
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [status, speed, events, progressUnit])

  // game_end 감지
  useEffect(() => {
    const revealed = events.slice(0, revealedCount)
    if (revealed.some(e => e.type === 'game_end')) {
      setStatus('ended')
    }
  }, [revealedCount, events])

  const revealedEvents = events.slice(0, revealedCount)

  const liveState = deriveState(
    revealedEvents,
    homeLineup,
    awayLineup,
    homePitcher,
    awayPitcher,
  )

  const pbpGroups = buildPBPGroups(revealedEvents, awayLineup, homeLineup)

  const result = status === 'ended' ? gameResult : null

  return {
    status,
    revealedCount,
    speed,
    liveState,
    pbpGroups,
    result,
    pause:    () => setStatus('paused'),
    resume:   () => {
      if (status !== 'ended') setStatus('playing')
    },
    next:     () => {
      if (status === 'paused') advance()
    },
    setSpeed: (s: Speed) => setSpeedState(s),
  }
}
