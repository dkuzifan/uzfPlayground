'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TEAMS, getTeamById, type TeamWithStats, type PlayerWithStats } from '@/lib/baseball/data/teams'
import { STADIUMS, type Stadium } from '@/lib/baseball/data/stadiums'
import { saveGameConfig, type GameMode, type ProgressUnit, type HomeSide } from '@/lib/baseball/data/game-config'

// ============================================================
// 스텝 인디케이터
// ============================================================

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = ['팀 선택', '경기 설정', '프리게임']
  return (
    <div className="mb-8 flex items-center justify-center">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3
        const done   = n < current
        const active = n === current
        return (
          <div key={n} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition-colors ${
                done   ? 'border-transparent bg-green-500/20 text-green-400' :
                active ? 'border-green-500/50 bg-green-500/10 text-green-400' :
                         'border-transparent bg-white/8 text-white/20'
              }`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-[10px] whitespace-nowrap ${active || done ? 'text-white/50' : 'text-white/20'}`}>
                {label}
              </span>
            </div>
            {i < 2 && <div className="mx-2 mb-5 h-px w-12 bg-white/10" />}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// 팀 캐러셀
// ============================================================

function TeamCarousel({
  label, selectedId, disabledId, onChange,
}: {
  label: string
  selectedId: string | null
  disabledId: string | null
  onChange: (id: string) => void
}) {
  const idx = selectedId ? TEAMS.findIndex(t => t.id === selectedId) : 0
  const [cursor, setCursor] = useState(idx < 0 ? 0 : idx)
  const n = TEAMS.length

  const prev = (cursor - 1 + n) % n
  const next = (cursor + 1) % n

  function rotate(dir: -1 | 1) {
    const newCursor = (cursor + dir + n) % n
    setCursor(newCursor)
    if (TEAMS[newCursor].id !== disabledId) onChange(TEAMS[newCursor].id)
  }

  function jumpTo(i: number) {
    if (TEAMS[i].id === disabledId) return
    setCursor(i)
    onChange(TEAMS[i].id)
  }

  const cur  = TEAMS[cursor]
  const tPrev = TEAMS[prev]
  const tNext = TEAMS[next]
  const isConflict = cur.id === disabledId

  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/50">{label}</p>
      <div className="flex items-center justify-center gap-2">

        {/* 이전 버튼 */}
        <button
          onClick={() => rotate(-1)}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/10 text-lg text-white/50 transition-colors hover:border-white/25 hover:text-white"
        >
          ‹
        </button>

        {/* 트랙 */}
        <div className="flex flex-1 items-center justify-center gap-1 overflow-hidden">

          {/* 왼쪽 (dim) */}
          <div
            className="flex w-20 flex-shrink-0 cursor-pointer flex-col items-center gap-1.5 opacity-30 transition-opacity hover:opacity-50"
            onClick={() => jumpTo(prev)}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-black text-white"
              style={{ background: tPrev.primary_color }}>
              {tPrev.short_name}
            </div>
            <span className="text-center text-[10px] text-white/50 leading-tight">{tPrev.name}</span>
          </div>

          {/* 중앙 (활성) */}
          <div
            className={`flex w-48 flex-shrink-0 flex-col items-center gap-2.5 rounded-2xl border-2 px-4 py-5 transition-colors ${
              isConflict
                ? 'border-red-500/40 bg-red-500/8'
                : 'border-[var(--tc-border)] bg-[var(--tc-bg)]'
            }`}
            style={{
              '--tc-border': cur.primary_color + '80',
              '--tc-bg':     cur.primary_color + '18',
            } as React.CSSProperties}
          >
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-black text-white"
              style={{ background: cur.primary_color }}
            >
              {cur.short_name}
            </div>
            <span className="text-center text-sm font-semibold">{cur.name}</span>
            {isConflict && (
              <span className="text-[10px] text-red-400">상대 팀과 중복</span>
            )}
          </div>

          {/* 오른쪽 (dim) */}
          <div
            className="flex w-20 flex-shrink-0 cursor-pointer flex-col items-center gap-1.5 opacity-30 transition-opacity hover:opacity-50"
            onClick={() => jumpTo(next)}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-black text-white"
              style={{ background: tNext.primary_color }}>
              {tNext.short_name}
            </div>
            <span className="text-center text-[10px] text-white/50 leading-tight">{tNext.name}</span>
          </div>

        </div>

        {/* 다음 버튼 */}
        <button
          onClick={() => rotate(1)}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/10 text-lg text-white/50 transition-colors hover:border-white/25 hover:text-white"
        >
          ›
        </button>

      </div>
    </div>
  )
}

// ============================================================
// 구장 모달
// ============================================================

function StadiumModal({
  selected, onSelect, onClose,
}: {
  selected: string | null
  onSelect: (id: string) => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-80 overflow-hidden rounded-2xl border border-white/10 bg-neutral-900"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <span className="font-bold">구장 선택</span>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-sm text-white/50 hover:text-white">✕</button>
        </div>
        <div className="p-2">
          {STADIUMS.map(s => (
            <button
              key={s.id}
              onClick={() => { onSelect(s.id); onClose() }}
              className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors hover:bg-white/6 ${
                selected === s.id ? 'bg-green-500/8' : ''
              }`}
            >
              <div>
                <p className="text-sm font-semibold">🏟 {s.name}</p>
                <p className="text-xs text-white/50">{s.location}</p>
              </div>
              {selected === s.id && <span className="text-green-400">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 로스터 섹션 (프리게임)
// ============================================================

function RosterSection({ team, side }: { team: TeamWithStats; side: '홈' | '원정' }) {
  const sp      = team.players.find(p => p.position_1 === 'P')!
  const batters = team.players.filter(p => p.position_1 !== 'P')

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center gap-2 rounded-t-lg border border-b-0 border-white/10 bg-white/4 px-3 py-2.5">
        <div className="h-2.5 w-2.5 rounded-full" style={{ background: team.primary_color }} />
        <span className="text-sm font-semibold">{team.name}</span>
        <span className="ml-auto rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/50">{side}</span>
      </div>

      {/* 선발 투수 */}
      <div className="border border-b-0 border-t-0 border-white/10">
        <p className="border-b border-white/6 bg-white/3 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/25">
          선발 투수
        </p>
        <RosterRow player={sp} order={null} />
      </div>

      {/* 타순 */}
      <div className="rounded-b-lg border border-white/10">
        <p className="border-b border-white/6 bg-white/3 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/25">
          타순
        </p>
        {batters.map((p, i) => (
          <RosterRow key={p.id} player={p} order={i + 1} />
        ))}
      </div>
    </div>
  )
}

function RosterRow({ player, order }: { player: PlayerWithStats; order: number | null }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-white/4 px-2.5 py-1.5 text-xs last:border-b-0">
      <span className="w-4 text-right text-[10px] text-white/20">{player.number}</span>
      <span className="w-6 text-[10px] font-bold text-white/50">{player.position_1}</span>
      <span className="flex-1">{player.name}</span>
      {/* 스탯 */}
      {player.pitcherSeason && (
        <div className="flex gap-2">
          <StatChip label="ERA"  value={player.pitcherSeason.era.toFixed(2)} />
          <StatChip label="WHIP" value={player.pitcherSeason.whip.toFixed(2)} />
        </div>
      )}
      {player.batterSeason && (
        <div className="flex gap-2">
          <StatChip label="AVG" value={player.batterSeason.avg.toFixed(3).replace('0.', '.')} />
          <StatChip label="OPS" value={player.batterSeason.ops.toFixed(3).replace('0.', '.')} />
        </div>
      )}
      <button disabled className="cursor-not-allowed rounded border border-white/8 px-1.5 py-0.5 text-[10px] text-white/20">
        교체
      </button>
    </div>
  )
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-8 flex-col items-end gap-0.5">
      <span className="text-[9px] text-white/25">{label}</span>
      <span className="text-[11px] font-semibold text-white/50">{value}</span>
    </div>
  )
}

// ============================================================
// 옵션 카드 (홈/원정, 게임 모드, 진행 단위)
// ============================================================

function OptionCard({
  selected, onClick, title, desc,
}: {
  selected: boolean; onClick: () => void; title: string; desc: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-xl border px-4 py-3 text-center transition-colors ${
        selected
          ? 'border-green-500/50 bg-green-500/9'
          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
      }`}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-[11px] text-white/50">{desc}</p>
    </button>
  )
}

// ============================================================
// 메인 페이지
// ============================================================

export default function SetupPage() {
  const router = useRouter()

  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1
  const [myTeamId,  setMyTeamId]  = useState<string>(TEAMS[0].id)
  const [oppTeamId, setOppTeamId] = useState<string>(TEAMS[3].id)

  // Step 2
  const [stadiumId,     setStadiumId]     = useState<string | null>(null)
  const [homeSide,      setHomeSide]      = useState<HomeSide | null>(null)
  const [gameMode,      setGameMode]      = useState<GameMode | null>(null)
  const [progressUnit,  setProgressUnit]  = useState<ProgressUnit | null>(null)
  const [showStadiumModal, setShowStadiumModal] = useState(false)

  const step1Valid = myTeamId !== oppTeamId
  const step2Valid = !!stadiumId && !!homeSide && !!gameMode && !!progressUnit

  const selectedStadium = STADIUMS.find(s => s.id === stadiumId)
  const myTeam  = getTeamById(myTeamId)!
  const oppTeam = getTeamById(oppTeamId)!

  function startGame() {
    saveGameConfig({ myTeamId, oppTeamId, stadiumId: stadiumId!, homeSide: homeSide!, gameMode: gameMode!, progressUnit: progressUnit! })
    router.push('/arena/baseball/game')
  }

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(34,197,94,0.07)_0%,transparent_70%)]" />
      <div className="mx-auto max-w-xl px-4 py-10">

        <StepIndicator current={step} />

        {/* ── Step 1: 팀 선택 ── */}
        {step === 1 && (
          <div className="flex flex-col gap-8">
            <TeamCarousel
              label="내 팀"
              selectedId={myTeamId}
              disabledId={oppTeamId}
              onChange={setMyTeamId}
            />
            <TeamCarousel
              label="상대 팀"
              selectedId={oppTeamId}
              disabledId={myTeamId}
              onChange={setOppTeamId}
            />
            <div className="flex items-center justify-between">
              <Link href="/arena/baseball" className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white">
                ← 타이틀로
              </Link>
              <button
                disabled={!step1Valid}
                onClick={() => setStep(2)}
                className="rounded-lg bg-green-500 px-7 py-2.5 text-sm font-bold text-black transition-opacity disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/20"
              >
                다음 →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: 경기 설정 ── */}
        {step === 2 && (
          <div className="flex flex-col gap-6">

            {/* 구장 */}
            <div>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">구장</p>
              <button
                onClick={() => setShowStadiumModal(true)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3.5 transition-colors ${
                  selectedStadium ? 'border-green-500/40 bg-green-500/7' : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                <div className="text-left">
                  <p className="text-sm font-semibold">
                    {selectedStadium ? `🏟 ${selectedStadium.name}` : '구장을 선택하세요'}
                  </p>
                  {selectedStadium && <p className="text-xs text-white/50">{selectedStadium.location}</p>}
                </div>
                <span className="rounded border border-white/10 px-2.5 py-1 text-xs text-white/40">변경</span>
              </button>
            </div>

            {/* 홈/원정 */}
            <div>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">내 팀 홈/원정</p>
              <div className="flex gap-2">
                <OptionCard selected={homeSide === 'home'} onClick={() => setHomeSide('home')} title="🏠 홈"   desc="말 공격 (Bottom)" />
                <OptionCard selected={homeSide === 'away'} onClick={() => setHomeSide('away')} title="✈️ 원정" desc="초 공격 (Top)" />
              </div>
            </div>

            {/* 게임 모드 */}
            <div>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">게임 모드</p>
              <div className="flex gap-2">
                <OptionCard selected={gameMode === 'manager'}    onClick={() => setGameMode('manager')}    title="🎮 감독 모드"      desc="타석·투구마다 직접 결정" />
                <OptionCard selected={gameMode === 'simulation'} onClick={() => setGameMode('simulation')} title="⚡ 풀 시뮬레이션" desc="자동 진행 · 속도 조절" />
              </div>
            </div>

            {/* 진행 단위 */}
            <div>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">진행 단위</p>
              <div className="flex gap-2">
                <OptionCard selected={progressUnit === 'at_bat'} onClick={() => setProgressUnit('at_bat')} title="🧢 타석 기준" desc="타석 결과 단위로 진행" />
                <OptionCard selected={progressUnit === 'pitch'}  onClick={() => setProgressUnit('pitch')}  title="⚾ 투구 기준" desc="투구 하나씩 진행" />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => setStep(1)} className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white">
                ← 팀 선택
              </button>
              <button
                disabled={!step2Valid}
                onClick={() => setStep(3)}
                className="rounded-lg bg-green-500 px-7 py-2.5 text-sm font-bold text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/20"
              >
                다음 →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: 프리게임 ── */}
        {step === 3 && (
          <div className="flex flex-col gap-5">

            {/* 설정 요약 */}
            <div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="rounded-full bg-white/6 px-3 py-1 text-xs text-white/50">
                🏟 <strong className="text-white">{selectedStadium?.name}</strong>
              </span>
              <span className="rounded-full bg-white/6 px-3 py-1 text-xs text-white/50">
                내 팀 <strong className="text-white">{homeSide === 'home' ? '홈 (Bottom)' : '원정 (Top)'}</strong>
              </span>
              <span className="rounded-full bg-white/6 px-3 py-1 text-xs text-white/50">
                <strong className="text-white">{gameMode === 'manager' ? '🎮 감독 모드' : '⚡ 풀 시뮬레이션'}</strong>
              </span>
              <span className="rounded-full bg-white/6 px-3 py-1 text-xs text-white/50">
                <strong className="text-white">{progressUnit === 'at_bat' ? '🧢 타석 기준' : '⚾ 투구 기준'}</strong>
              </span>
            </div>

            {/* 로스터 */}
            <div className="grid grid-cols-2 gap-4">
              <RosterSection team={myTeam}  side={homeSide === 'home' ? '홈' : '원정'} />
              <RosterSection team={oppTeam} side={homeSide === 'home' ? '원정' : '홈'} />
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => setStep(2)} className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white">
                ← 경기 설정
              </button>
              <button
                onClick={startGame}
                className="rounded-lg bg-green-500 px-8 py-3 text-sm font-bold text-black"
              >
                ⚾ 경기 시작
              </button>
            </div>
          </div>
        )}

      </div>

      {/* 구장 모달 */}
      {showStadiumModal && (
        <StadiumModal
          selected={stadiumId}
          onSelect={setStadiumId}
          onClose={() => setShowStadiumModal(false)}
        />
      )}
    </div>
  )
}
