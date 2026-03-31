'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { loadGameConfig, type GameConfig } from '@/lib/baseball/data/game-config'
import { getTeamById } from '@/lib/baseball/data/teams'
import { STADIUMS } from '@/lib/baseball/data/stadiums'

export default function GamePage() {
  const [config, setConfig] = useState<GameConfig | null>(null)

  useEffect(() => {
    setConfig(loadGameConfig())
  }, [])

  if (!config) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-white/40">게임 설정을 찾을 수 없습니다.</p>
        <Link href="/arena/baseball/setup" className="text-sm text-white/50 hover:text-white/80 transition-colors">
          ← 셋업으로 돌아가기
        </Link>
      </div>
    )
  }

  const myTeam  = getTeamById(config.myTeamId)
  const oppTeam = getTeamById(config.oppTeamId)
  const stadium = STADIUMS.find(s => s.id === config.stadiumId)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
        <p className="mb-6 text-2xl">⚾</p>
        <h1 className="mb-1 text-xl font-bold">경기 화면 준비 중</h1>
        <p className="mb-8 text-sm text-white/40">게임 UI 피처에서 구현 예정입니다</p>

        <div className="mb-8 flex flex-col gap-2 rounded-xl border border-white/8 bg-white/3 px-4 py-4 text-left text-sm">
          <div className="flex justify-between">
            <span className="text-white/40">내 팀</span>
            <span className="font-semibold">{myTeam?.name ?? config.myTeamId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">상대 팀</span>
            <span className="font-semibold">{oppTeam?.name ?? config.oppTeamId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">구장</span>
            <span className="font-semibold">{stadium?.name ?? config.stadiumId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">홈/원정</span>
            <span className="font-semibold">{config.homeSide === 'home' ? '홈 (Bottom)' : '원정 (Top)'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">게임 모드</span>
            <span className="font-semibold">{config.gameMode === 'manager' ? '감독 모드' : '풀 시뮬레이션'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">진행 단위</span>
            <span className="font-semibold">{config.progressUnit === 'at_bat' ? '타석 기준' : '투구 기준'}</span>
          </div>
        </div>

        <Link
          href="/arena/baseball"
          className="text-sm text-white/40 transition-colors hover:text-white/70"
        >
          ← 타이틀로 돌아가기
        </Link>
      </div>
    </div>
  )
}
