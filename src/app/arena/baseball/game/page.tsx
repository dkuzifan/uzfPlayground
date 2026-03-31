'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { loadGameConfig } from '@/lib/baseball/data/game-config'
import { getTeamById, type TeamWithStats } from '@/lib/baseball/data/teams'
import { buildLineup } from '@/lib/baseball/game/build-lineup'
import { runGame } from '@/lib/baseball/game/game-loop'
import { formatIP, calcBatterDerived, calcPitcherDerived } from '@/lib/baseball/game/stats-types'
import { useGamePlayback, type PBPGroup, type AtBatGroup, type Speed } from '@/hooks/baseball/useGamePlayback'
import type { GameResult } from '@/lib/baseball/game/types'
import type { Player } from '@/lib/baseball/types/player'
import type { TeamWithStats as TW } from '@/lib/baseball/data/teams'

// ============================================================
// 색상 상수
// ============================================================
const COLOR = {
  ball:   'bg-blue-500',
  strike: 'bg-red-500',
  foul:   'bg-yellow-400',
  inplay: 'bg-emerald-500',
} as const

const DOT_COLOR = {
  ball:   'bg-blue-500/80 border-blue-400',
  strike: 'bg-red-500/80 border-red-400',
  foul:   'bg-yellow-400/80 border-yellow-300',
  inplay: 'bg-emerald-500/80 border-emerald-400',
} as const

// ============================================================
// GamePage
// ============================================================

export default function GamePage() {
  const router = useRouter()
  const [phase, setPhase] = useState<'loading' | 'ready' | 'no-config'>('loading')
  const [gameResult, setGameResult]     = useState<GameResult | null>(null)
  const [homeTeam,   setHomeTeam]       = useState<TW | null>(null)
  const [awayTeam,   setAwayTeam]       = useState<TW | null>(null)
  const [homePitcher, setHomePitcher]   = useState<Player | null>(null)
  const [awayPitcher, setAwayPitcher]   = useState<Player | null>(null)
  const [homeLineup,  setHomeLineup]    = useState<Player[]>([])
  const [awayLineup,  setAwayLineup]    = useState<Player[]>([])
  const [progressUnit, setProgressUnit] = useState<'at_bat' | 'pitch'>('at_bat')
  const [activeTab, setActiveTab]       = useState<'live' | 'box'>('live')

  useEffect(() => {
    const config = loadGameConfig()
    if (!config) { setPhase('no-config'); return }

    const myTeamData  = getTeamById(config.myTeamId)
    const oppTeamData = getTeamById(config.oppTeamId)
    if (!myTeamData || !oppTeamData) { setPhase('no-config'); return }

    const home = config.homeSide === 'home' ? myTeamData  : oppTeamData
    const away = config.homeSide === 'home' ? oppTeamData : myTeamData

    const homeBuilt = buildLineup(home)
    const awayBuilt = buildLineup(away)

    const result = runGame(homeBuilt, awayBuilt)

    setHomeTeam(home)
    setAwayTeam(away)
    setHomePitcher(homeBuilt.pitcher)
    setAwayPitcher(awayBuilt.pitcher)
    setHomeLineup(homeBuilt.lineup)
    setAwayLineup(awayBuilt.lineup)
    setGameResult(result)
    setProgressUnit(config.progressUnit)
    setPhase('ready')
  }, [])

  if (phase === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
          <p className="text-sm text-white/50">경기 시뮬레이션 중...</p>
        </div>
      </div>
    )
  }

  if (phase === 'no-config' || !gameResult || !homeTeam || !awayTeam || !homePitcher || !awayPitcher) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-white/40">게임 설정을 찾을 수 없습니다.</p>
        <button
          onClick={() => router.push('/arena/baseball/setup')}
          className="text-sm text-white/50 hover:text-white/80 transition-colors"
        >
          ← 셋업으로 돌아가기
        </button>
      </div>
    )
  }

  return (
    <GameScreen
      gameResult={gameResult}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      homePitcher={homePitcher}
      awayPitcher={awayPitcher}
      homeLineup={homeLineup}
      awayLineup={awayLineup}
      progressUnit={progressUnit}
      activeTab={activeTab}
      onTabSwitch={setActiveTab}
    />
  )
}

// ============================================================
// GameScreen — 메인 화면
// ============================================================

function GameScreen({
  gameResult, homeTeam, awayTeam,
  homePitcher, awayPitcher, homeLineup, awayLineup,
  progressUnit, activeTab, onTabSwitch,
}: {
  gameResult:   GameResult
  homeTeam:     TW
  awayTeam:     TW
  homePitcher:  Player
  awayPitcher:  Player
  homeLineup:   Player[]
  awayLineup:   Player[]
  progressUnit: 'at_bat' | 'pitch'
  activeTab:    'live' | 'box'
  onTabSwitch:  (t: 'live' | 'box') => void
}) {
  const pb = useGamePlayback(
    gameResult, homeLineup, awayLineup, homePitcher, awayPitcher, progressUnit,
  )

  const router = useRouter()
  const { liveState, pbpGroups, status, speed, result } = pb

  if (status === 'ended' && result) {
    return (
      <ResultScreen
        result={result}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        onSetup={() => router.push('/arena/baseball/setup')}
        onTitle={() => router.push('/arena/baseball')}
      />
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0f]">
      {/* 상단 배너 */}
      <ScoreBanner
        score={liveState.score}
        inning={liveState.inning}
        isTop={liveState.isTop}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
      />

      {/* 탭 */}
      <div className="flex border-b border-white/10 px-4">
        {(['live', 'box'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => onTabSwitch(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-white text-white'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {tab === 'live' ? 'Live' : 'Box'}
          </button>
        ))}
      </div>

      {/* 탭 내용 */}
      {activeTab === 'live' ? (
        <LiveTab pb={pb} homeTeam={homeTeam} awayTeam={awayTeam} />
      ) : (
        <BoxTab gameResult={gameResult} homeTeam={homeTeam} awayTeam={awayTeam} />
      )}
    </div>
  )
}

// ============================================================
// ScoreBanner
// ============================================================

function ScoreBanner({
  score, inning, isTop, homeTeam, awayTeam,
}: {
  score:    { home: number; away: number }
  inning:   number
  isTop:    boolean
  homeTeam: TW
  awayTeam: TW
}) {
  const inningLabel = `${isTop ? '초' : '말'} ${inning}회`

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold" style={{ color: awayTeam.primary_color }}>
          {awayTeam.short_name}
        </span>
        <span className="text-2xl font-bold tabular-nums">{score.away}</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-xs text-white/40">{inningLabel}</span>
        <span className="text-sm text-white/60">vs</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-2xl font-bold tabular-nums">{score.home}</span>
        <span className="text-sm font-semibold" style={{ color: homeTeam.primary_color }}>
          {homeTeam.short_name}
        </span>
      </div>
    </div>
  )
}

// ============================================================
// LiveTab
// ============================================================

function LiveTab({ pb, homeTeam, awayTeam }: {
  pb:       ReturnType<typeof useGamePlayback>
  homeTeam: TW
  awayTeam: TW
}) {
  const { liveState, pbpGroups, status, speed } = pb

  return (
    <div className="flex flex-1 flex-col sm:flex-row mx-auto w-full max-w-[960px] px-0 sm:px-6 sm:py-4 sm:gap-4">
      {/* 좌: 게임뷰 */}
      <div className="flex flex-col gap-3 p-4 sm:flex-[6] sm:p-0">
        {/* 상태 헤더 (이닝 + 아웃 + 투구수 표시) */}
        <ZoneStatus
          inning={liveState.inning}
          isTop={liveState.isTop}
          outs={liveState.outs}
        />
        {/* 스트라이크존 히어로 */}
        <ZoneVisual pitchDots={liveState.pitchDots} />
        {/* 주자 + 볼카운트 */}
        <ZoneFooter runners={liveState.runners} count={liveState.count} />
        {/* 매치업 */}
        <MatchupBar
          pitcher={liveState.currentPitcher}
          batter={liveState.currentBatter}
          onDeck={liveState.onDeck}
          gameResult={null}
        />
        {/* 컨트롤 */}
        <ControlBar
          status={status}
          speed={speed}
          onPause={pb.pause}
          onResume={pb.resume}
          onNext={pb.next}
          onSetSpeed={pb.setSpeed}
        />
      </div>

      {/* 우: PBP 로그 */}
      <div className="border-t border-white/10 sm:border-t-0 sm:border-l sm:flex-[4] sm:min-w-[320px] sm:overflow-y-auto sm:max-h-[calc(100vh-140px)]">
        <PBPLog groups={pbpGroups} />
      </div>
    </div>
  )
}

// ============================================================
// ZoneStatus
// ============================================================

function ZoneStatus({ inning, isTop, outs }: {
  inning: number
  isTop:  boolean
  outs:   number
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="font-semibold text-white/80">
        {isTop ? '초' : '말'} {inning}회
      </span>
      <div className="flex items-center gap-1.5">
        <span className="text-white/40 text-xs mr-1">OUT</span>
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className={`h-3 w-3 rounded-full border ${
              i < outs
                ? 'bg-yellow-400 border-yellow-300'
                : 'bg-white/10 border-white/20'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

// ============================================================
// ZoneVisual — 스트라이크존 히어로
// ============================================================

function ZoneVisual({ pitchDots }: { pitchDots: ReturnType<typeof useGamePlayback>['liveState']['pitchDots'] }) {
  return (
    <div className="flex justify-center">
      <div
        className="relative rounded-lg bg-white/5 border border-white/10"
        style={{ width: 'min(260px, 88%)', aspectRatio: '220/164' }}
      >
        {/* 배경 라벨 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] text-white/10 font-medium tracking-widest">STRIKE ZONE</span>
        </div>

        {/* 스트라이크존 사각형 */}
        <div
          className="absolute border border-white/30 rounded"
          style={{ left: '25%', top: '8.5%', width: '50%', height: '72%' }}
        >
          {/* 3×3 내부 그리드 */}
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-white/10" />
            ))}
          </div>
        </div>

        {/* 홈플레이트 */}
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-[4%] w-[22%] h-[6%] bg-white/15 rounded-sm"
        />

        {/* 투구 도트 */}
        {pitchDots.map(dot => (
          <div
            key={dot.num}
            className={`absolute flex items-center justify-center rounded-full border text-[9px] font-bold text-white transition-all duration-200 ${DOT_COLOR[dot.result]} ${dot.isLatest ? 'shadow-lg scale-110' : 'opacity-70'}`}
            style={{
              left:      `${dot.zoneX}%`,
              top:       `${dot.zoneY}%`,
              width:     dot.isLatest ? '20px' : '16px',
              height:    dot.isLatest ? '20px' : '16px',
              transform: `translate(-50%, -50%) ${dot.isLatest ? 'scale(1.1)' : ''}`,
            }}
          >
            {dot.num}
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// ZoneFooter — 주자 + 볼카운트
// ============================================================

function ZoneFooter({
  runners, count,
}: {
  runners: { first: boolean; second: boolean; third: boolean }
  count:   { balls: number; strikes: number }
}) {
  return (
    <div className="flex items-center justify-between">
      {/* 다이아몬드 */}
      <div className="relative" style={{ width: 64, height: 52 }}>
        {/* 2루 */}
        <Base active={runners.second} style={{ top: 2, left: '50%', transform: 'translateX(-50%) rotate(45deg)' }} />
        {/* 3루 */}
        <Base active={runners.third} style={{ top: '50%', left: 4, transform: 'translateY(-50%) rotate(45deg)' }} />
        {/* 1루 */}
        <Base active={runners.first} style={{ top: '50%', right: 4, transform: 'translateY(-50%) rotate(45deg)' }} />
        {/* 홈 */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white/20 rounded-sm" />
      </div>

      {/* 볼카운트 */}
      <div className="flex items-center gap-3 text-sm">
        <CountRow label="B" count={count.balls}   total={4} dotClass="bg-blue-500"   />
        <CountRow label="S" count={count.strikes} total={3} dotClass="bg-red-500"    />
      </div>
    </div>
  )
}

function Base({ active, style }: { active: boolean; style: React.CSSProperties }) {
  return (
    <div
      className={`absolute w-4 h-4 rounded-sm border ${
        active
          ? 'bg-yellow-400 border-yellow-300'
          : 'bg-white/10 border-white/20'
      }`}
      style={style}
    />
  )
}

function CountRow({ label, count, total, dotClass }: {
  label:    string
  count:    number
  total:    number
  dotClass: string
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-white/40 text-xs w-3">{label}</span>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-2.5 w-2.5 rounded-full border ${
            i < count
              ? `${dotClass} border-transparent`
              : 'bg-white/10 border-white/20'
          }`}
        />
      ))}
    </div>
  )
}

// ============================================================
// MatchupBar
// ============================================================

function MatchupBar({
  pitcher, batter, onDeck, gameResult,
}: {
  pitcher:    Player
  batter:     Player
  onDeck:     Player
  gameResult: GameResult | null
}) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 flex justify-between items-center text-sm">
      <div>
        <p className="text-white/40 text-xs mb-0.5">투수</p>
        <p className="font-semibold">{pitcher.name}</p>
        <p className="text-white/40 text-xs">#{pitcher.number}</p>
      </div>
      <div className="text-white/20 text-lg">vs</div>
      <div className="text-right">
        <p className="text-white/40 text-xs mb-0.5">타자</p>
        <p className="font-semibold">{batter.name}</p>
        <p className="text-white/40 text-xs">On deck: {onDeck.name}</p>
      </div>
    </div>
  )
}

// ============================================================
// ControlBar
// ============================================================

function ControlBar({
  status, speed, onPause, onResume, onNext, onSetSpeed,
}: {
  status:     ReturnType<typeof useGamePlayback>['status']
  speed:      Speed
  onPause:    () => void
  onResume:   () => void
  onNext:     () => void
  onSetSpeed: (s: Speed) => void
}) {
  const speeds: Speed[] = ['slow', 'normal', 'fast']
  const speedLabel: Record<Speed, string> = { slow: '느림', normal: '보통', fast: '빠름' }

  return (
    <div className="flex items-center justify-between gap-2">
      {/* 재생/일시정지 */}
      <button
        onClick={status === 'playing' ? onPause : onResume}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
      >
        {status === 'playing' ? '⏸' : '▶'}
      </button>

      {/* 다음 (일시정지 시) */}
      {status === 'paused' && (
        <button
          onClick={onNext}
          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm transition-colors"
        >
          다음 →
        </button>
      )}

      {/* 속도 */}
      <div className="flex gap-1 ml-auto">
        {speeds.map(s => (
          <button
            key={s}
            onClick={() => onSetSpeed(s)}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              speed === s
                ? 'bg-white text-black font-semibold'
                : 'bg-white/10 text-white/50 hover:bg-white/20'
            }`}
          >
            {speedLabel[s]}
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// PBPLog — 이닝별 그룹
// ============================================================

function PBPLog({ groups }: { groups: PBPGroup[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [groups])

  if (groups.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-white/30">
        경기 시작 대기 중...
      </div>
    )
  }

  return (
    <div className="py-2">
      {groups.map((group, gi) => (
        <InnSection key={`${group.inning}-${group.isTop}`} group={group} defaultOpen={group.isActive} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

function InnSection({ group, defaultOpen }: { group: PBPGroup; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  // 현재 활성 이닝이 되면 자동으로 열기
  useEffect(() => {
    if (group.isActive) setOpen(true)
  }, [group.isActive])

  const label = `${group.inning}회 ${group.isTop ? '초' : '말'}`

  return (
    <div className="border-b border-white/8">
      {/* 이닝 토글 헤더 */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-white/3 transition-colors"
      >
        <span className="font-medium text-white/70">
          {open ? '▾' : '▸'} {label}
        </span>
        {!group.isActive && (
          <span className="text-xs text-white/30">{group.summary}</span>
        )}
        {group.isActive && (
          <span className="text-xs text-emerald-400">● 진행 중</span>
        )}
      </button>

      {/* 타석 목록 */}
      {open && (
        <div className="pb-1">
          {group.atBats.map((ab, i) => (
            <AtBatBlock key={i} ab={ab} />
          ))}
        </div>
      )}
    </div>
  )
}

function AtBatBlock({ ab }: { ab: AtBatGroup }) {
  return (
    <div className="px-4">
      {/* 투수 교체 */}
      {ab.pitchChange && (
        <div className="my-1.5 rounded bg-purple-500/10 px-2.5 py-1 text-xs text-purple-300">
          {ab.pitchChange}
        </div>
      )}
      {/* 타자 헤더 */}
      <div className="py-1.5 text-xs text-white/40">
        {ab.batterOrder}번 {ab.batterName}
      </div>
      {/* 투구 행 */}
      {ab.pitches.map((pitch, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
          <div className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${COLOR[pitch.colorKey]}`}>
            {pitch.num}
          </div>
          <span className="text-white/60">{pitch.text}</span>
        </div>
      ))}
      {/* 타석 결과 */}
      {ab.result && (
        <div className={`my-1 rounded px-2.5 py-1.5 text-xs font-semibold ${
          ['안타', '2루타', '3루타', '홈런'].includes(ab.result.title)
            ? 'bg-emerald-500/15 text-emerald-300'
            : ab.result.title === '홈런'
              ? 'bg-yellow-500/15 text-yellow-300'
              : 'bg-white/5 text-white/60'
        }`}>
          {ab.result.title}
          {ab.result.sub && ab.result.sub !== ab.result.title && (
            <span className="ml-1 font-normal text-white/40">— {ab.result.sub}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// BoxTab
// ============================================================

function BoxTab({ gameResult, homeTeam, awayTeam }: {
  gameResult: GameResult
  homeTeam:   TW
  awayTeam:   TW
}) {
  const { stats, linescore } = gameResult

  return (
    <div className="mx-auto w-full max-w-[960px] px-4 py-4 space-y-6">
      {/* 라인스코어 */}
      <Linescore
        linescore={linescore}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        finalScore={gameResult.score}
      />
      {/* 타자 스탯 */}
      <BatterTable stats={stats.away.batters}  teamName={awayTeam.name}  color={awayTeam.primary_color} />
      <BatterTable stats={stats.home.batters}  teamName={homeTeam.name}  color={homeTeam.primary_color} />
      {/* 투수 스탯 */}
      <PitcherTable stats={stats.away.pitchers} teamName={awayTeam.name}  color={awayTeam.primary_color} />
      <PitcherTable stats={stats.home.pitchers} teamName={homeTeam.name}  color={homeTeam.primary_color} />
    </div>
  )
}

function Linescore({ linescore, homeTeam, awayTeam, finalScore }: {
  linescore:  { away: number[]; home: number[] }
  homeTeam:   TW
  awayTeam:   TW
  finalScore: { home: number; away: number }
}) {
  const innings = linescore.away.length

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-center">
        <thead>
          <tr className="text-white/30">
            <th className="py-1 text-left pr-3 w-24">팀</th>
            {Array.from({ length: innings }, (_, i) => (
              <th key={i} className="py-1 w-7">{i + 1}</th>
            ))}
            <th className="py-1 w-10 font-bold">R</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-1 text-left font-semibold" style={{ color: awayTeam.primary_color }}>{awayTeam.short_name}</td>
            {linescore.away.map((r, i) => (
              <td key={i} className="py-1 text-white/70">{r}</td>
            ))}
            <td className="py-1 font-bold text-white">{finalScore.away}</td>
          </tr>
          <tr>
            <td className="py-1 text-left font-semibold" style={{ color: homeTeam.primary_color }}>{homeTeam.short_name}</td>
            {linescore.home.map((r, i) => (
              <td key={i} className="py-1 text-white/70">{r}</td>
            ))}
            <td className="py-1 font-bold text-white">{finalScore.home}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function BatterTable({ stats, teamName, color }: {
  stats:    ReturnType<typeof useGamePlayback>['result'] extends GameResult | null ? GameResult['stats']['home']['batters'] : never
  teamName: string
  color:    string
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold" style={{ color }}>{teamName} 타자</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-white/30 border-b border-white/10">
              <th className="py-1 text-left">선수</th>
              <th className="py-1 w-8 text-center">AB</th>
              <th className="py-1 w-8 text-center">H</th>
              <th className="py-1 w-8 text-center">HR</th>
              <th className="py-1 w-8 text-center">RBI</th>
              <th className="py-1 w-12 text-center">AVG</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => {
              const d = calcBatterDerived(s)
              return (
                <tr key={i} className="border-b border-white/5 text-white/70">
                  <td className="py-1.5 font-medium text-white/90">{s.player.name}</td>
                  <td className="py-1.5 text-center">{s.AB}</td>
                  <td className="py-1.5 text-center">{s.H}</td>
                  <td className="py-1.5 text-center">{s.HR}</td>
                  <td className="py-1.5 text-center">{s.RBI}</td>
                  <td className="py-1.5 text-center">{d.AVG.toFixed(3)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PitcherTable({ stats, teamName, color }: {
  stats:    GameResult['stats']['home']['pitchers']
  teamName: string
  color:    string
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold" style={{ color }}>{teamName} 투수</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-white/30 border-b border-white/10">
              <th className="py-1 text-left">선수</th>
              <th className="py-1 w-10 text-center">IP</th>
              <th className="py-1 w-8 text-center">H</th>
              <th className="py-1 w-8 text-center">ER</th>
              <th className="py-1 w-8 text-center">BB</th>
              <th className="py-1 w-8 text-center">SO</th>
              <th className="py-1 w-12 text-center">ERA</th>
              <th className="py-1 w-8 text-center">결과</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => {
              const d = calcPitcherDerived(s)
              const result = s.W ? '승' : s.L ? '패' : s.SV ? 'S' : '-'
              return (
                <tr key={i} className="border-b border-white/5 text-white/70">
                  <td className="py-1.5 font-medium text-white/90">{s.player.name}</td>
                  <td className="py-1.5 text-center">{d.IP}</td>
                  <td className="py-1.5 text-center">{s.H}</td>
                  <td className="py-1.5 text-center">{s.ER}</td>
                  <td className="py-1.5 text-center">{s.BB}</td>
                  <td className="py-1.5 text-center">{s.SO}</td>
                  <td className="py-1.5 text-center">{d.ERA.toFixed(2)}</td>
                  <td className="py-1.5 text-center font-semibold text-white/90">{result}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================
// ResultScreen
// ============================================================

function ResultScreen({
  result, homeTeam, awayTeam, onSetup, onTitle,
}: {
  result:   GameResult
  homeTeam: TW
  awayTeam: TW
  onSetup:  () => void
  onTitle:  () => void
}) {
  const isWalkOff = result.reason === 'walk_off'
  const winner    = result.winner === 'home' ? homeTeam : result.winner === 'away' ? awayTeam : null

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-[#0a0a0f] px-4 py-8">
      <div className="w-full max-w-lg space-y-6">
        {/* 결과 카드 */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          {isWalkOff && (
            <div className="mb-3 inline-block rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-semibold text-yellow-300">
              끝내기 승리
            </div>
          )}
          {winner ? (
            <>
              <p className="text-sm text-white/40 mb-1">승리</p>
              <p className="text-2xl font-bold mb-4" style={{ color: winner.primary_color }}>
                {winner.name}
              </p>
            </>
          ) : (
            <p className="text-2xl font-bold mb-4">무승부</p>
          )}
          <div className="flex items-center justify-center gap-6 text-5xl font-bold tabular-nums">
            <span style={{ color: awayTeam.primary_color }}>{result.score.away}</span>
            <span className="text-white/20 text-3xl">:</span>
            <span style={{ color: homeTeam.primary_color }}>{result.score.home}</span>
          </div>
          <div className="mt-2 flex justify-center gap-6 text-sm text-white/40">
            <span>{awayTeam.short_name}</span>
            <span>{homeTeam.short_name}</span>
          </div>
        </div>

        {/* 라인스코어 */}
        <Linescore
          linescore={result.linescore}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          finalScore={result.score}
        />

        {/* 투수 스탯 */}
        <PitcherTable stats={result.stats.away.pitchers} teamName={awayTeam.name} color={awayTeam.primary_color} />
        <PitcherTable stats={result.stats.home.pitchers} teamName={homeTeam.name} color={homeTeam.primary_color} />

        {/* 버튼 */}
        <div className="flex gap-3">
          <button
            onClick={onSetup}
            className="flex-1 rounded-xl border border-white/20 bg-white/5 py-3 text-sm font-semibold hover:bg-white/10 transition-colors"
          >
            다시 하기
          </button>
          <button
            onClick={onTitle}
            className="flex-1 rounded-xl border border-white/10 py-3 text-sm text-white/50 hover:text-white/80 transition-colors"
          >
            타이틀로
          </button>
        </div>
      </div>
    </div>
  )
}
