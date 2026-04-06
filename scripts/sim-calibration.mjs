/**
 * 야구 시뮬레이터 MLB 캘리브레이션 검증
 * npx tsx scripts/sim-calibration.mjs
 */

const { runGame } = await import('../src/lib/baseball/game/game-loop.ts')

// ── 선수 팩토리 ──────────────────────────────────────────────

function makePitcher(id, name, ctrl, stam = 100) {
  return {
    id, team_id: 't1', name, number: 1,
    age: 28, bats: 'R', throws: 'R',
    position_1: 'P', position_2: null, position_3: null,
    stats: {
      ball_power: 75, ball_control: ctrl, ball_break: 65, ball_speed: 80,
      contact: 0, power: 0, defence: 70, throw: 65, running: 50, stamina: stam,
    },
    pitch_types: [
      { type: 'fastball',  weight: 40, ball_power: 80, ball_control: ctrl,      ball_break: 20, ball_speed: 88 },
      { type: 'slider',    weight: 30, ball_power: 65, ball_control: ctrl - 5,  ball_break: 80, ball_speed: 72 },
      { type: 'changeup',  weight: 20, ball_power: 60, ball_control: ctrl,      ball_break: 65, ball_speed: 64 },
      { type: 'curveball', weight: 10, ball_power: 55, ball_control: ctrl - 10, ball_break: 88, ball_speed: 60 },
    ],
    zone_bottom: 0.55, zone_top: 1.20, portrait_url: null,
  }
}

function makeFielder(id, teamId, name, num, pos, contact, power, runStat = 70, throwStat = 65, defStat = 70) {
  return {
    id, team_id: teamId, name, number: num,
    age: 28, bats: 'R', throws: 'R',
    position_1: pos, position_2: null, position_3: null,
    stats: {
      ball_power: 0, ball_control: 0, ball_break: 0, ball_speed: 0,
      contact, power,
      defence: defStat, throw: throwStat,
      running: runStat, stamina: 100,
    },
    pitch_types: [],
    zone_bottom: 0.55, zone_top: 1.20, portrait_url: null,
  }
}

function makeRealisticLineup(teamId, prefix, contactBase, powerBase) {
  const positions = ['LF', 'CF', 'RF', '1B', '2B', '3B', 'SS', 'C', 'P']
  const runStats  = [80, 85, 78, 60, 75, 70, 78, 55, 50]
  const throwSt   = [65, 70, 70, 65, 65, 65, 68, 75, 80]
  const defSt     = [70, 75, 70, 65, 72, 68, 75, 72, 50]
  return positions.map((pos, i) => {
    const c = pos === 'P' ? 30 : contactBase + Math.floor(Math.random() * 10) - 5
    const p = pos === 'P' ? 20 : powerBase   + Math.floor(Math.random() * 10) - 5
    return makeFielder(
      `${teamId}-${i}`, teamId, `${prefix}${pos}`, i + 1,
      pos, c, p, runStats[i], throwSt[i], defSt[i]
    )
  })
}

// ── 누적 통계 ────────────────────────────────────────────────

const GAMES = 200

const acc = {
  // 이벤트 카운터
  at_bat_result: {},
  pitch_swing: 0, pitch_contact: 0, pitch_total: 0,
  // 주루 — steal_result 기준 (실제 도루 판정 이벤트만 카운트, hit 중단 건 제외)
  steal_attempts: 0, steal_success: 0,
  steal_result_total: 0,  // steal_result 이벤트 합계 (success + caught)
  // 득점
  homeScore: 0, awayScore: 0,
  // 이닝
  innings: 0,
  // 진루
  runner_advance_events: 0,
  force_out: 0, runner_out: 0,
  // 라인드라이브 아웃 여부 확인용
  tag_up: 0,
  // 투수 IP
  totalOuts: 0,
}

console.log(`\n${GAMES}경기 시뮬레이션 중...`)

for (let g = 0; g < GAMES; g++) {
  const ht = {
    lineup:  makeRealisticLineup('home', '홈', 72, 68),
    pitcher: makePitcher('home-p', '홈선발', 70, 100),
    bullpen: [
      makePitcher('home-r1', '홈불펜1', 58, 60),
      makePitcher('home-r2', '홈불펜2', 52, 60),
      makePitcher('home-r3', '홈불펜3', 48, 60),
    ],
  }
  const at = {
    lineup:  makeRealisticLineup('away', '원정', 70, 65),
    pitcher: makePitcher('away-p', '원정선발', 68, 100),
    bullpen: [
      makePitcher('away-r1', '원정불펜1', 55, 60),
      makePitcher('away-r2', '원정불펜2', 50, 60),
      makePitcher('away-r3', '원정불펜3', 46, 60),
    ],
  }

  const r = runGame(ht, at)

  acc.homeScore += r.score.home
  acc.awayScore += r.score.away
  acc.innings   += r.linescore.away.length

  for (const e of r.events) {
    if (e.type === 'at_bat_result') {
      const res = e.payload.result
      acc.at_bat_result[res] = (acc.at_bat_result[res] ?? 0) + 1
    }
    if (e.type === 'pitch') {
      acc.pitch_total++
      if (e.payload.swing)           acc.pitch_swing++
      if (e.payload.contact === true) acc.pitch_contact++
    }
    if (e.type === 'steal_attempt')  acc.steal_attempts++
    if (e.type === 'steal_result') {
      acc.steal_result_total++
      if (e.payload.success) acc.steal_success++
    }
    if (e.type === 'runner_advance') acc.runner_advance_events++
    if (e.type === 'force_out')      acc.force_out++
    if (e.type === 'runner_out')     acc.runner_out++
    if (e.type === 'tag_up')         acc.tag_up++
  }
}

// ── 집계 ─────────────────────────────────────────────────────

const res = acc.at_bat_result
const totalPA   = Object.values(res).reduce((s, v) => s + v, 0)
const totalAB   = totalPA - (res.walk ?? 0) - (res.hit_by_pitch ?? 0)
const totalH    = (res.single ?? 0) + (res.double ?? 0) + (res.triple ?? 0) + (res.home_run ?? 0)
const totalSO   = res.strikeout ?? 0
const totalBB   = res.walk      ?? 0
const total1B   = res.single    ?? 0
const total2B   = res.double    ?? 0
const total3B   = res.triple    ?? 0
const totalHR   = res.home_run  ?? 0
const totalOut  = res.out       ?? 0
const totalErr  = res.reach_on_error ?? 0
const totalDP   = res.double_play    ?? 0
const totalFC   = res.fielders_choice ?? 0

const BA    = totalH / totalAB
const OBP   = (totalH + totalBB) / totalPA
// 단순 SLG: (1B + 2×2B + 3×3B + 4×HR) / AB
const TB    = total1B + 2*total2B + 3*total3B + 4*totalHR
const SLG   = TB / totalAB
const OPS   = OBP + SLG

// BABIP: (H - HR) / (AB - SO - HR + SF) ≈ (H - HR) / (AB - SO - HR)
const BABIP = (totalH - totalHR) / (totalAB - totalSO - totalHR)

const swingRate   = acc.pitch_swing   / acc.pitch_total
const contactRate = acc.pitch_contact / acc.pitch_swing   // swings only

const rpg       = (acc.homeScore + acc.awayScore) / GAMES   // 양팀 합산 per game
const rpgPerTeam = rpg / 2

const perGame = v => (v / GAMES).toFixed(2)

console.log('\n' + '='.repeat(62))
console.log('  MLB 캘리브레이션 검증 결과')
console.log('='.repeat(62))
console.log(`  시뮬레이션: ${GAMES}게임  총 타석: ${totalPA}`)
console.log()

// ── 타격 비율 ────────────────────────────────────────────────
console.log('[ 타격 비율 ]')
console.log(`  ${'지표'.padEnd(20)} ${'시뮬'.padStart(8)}  ${'MLB기준'.padStart(8)}  ${'판정'.padStart(6)}`)
console.log('  ' + '-'.repeat(46))

function line(label, simVal, mlbLow, mlbHigh, fmt = v => (v * 100).toFixed(1) + '%') {
  const s = fmt(simVal)
  const m = `${fmt(mlbLow)}~${fmt(mlbHigh)}`
  const ok = simVal >= mlbLow && simVal <= mlbHigh ? '✅' : simVal < mlbLow ? '🔵LOW' : '🔴HIGH'
  console.log(`  ${label.padEnd(20)} ${s.padStart(8)}  ${m.padStart(8)}  ${ok}`)
}

line('타율 (BA)',          BA,     0.240, 0.265)
line('출루율 (OBP)',        OBP,    0.310, 0.335)
line('장타율 (SLG)',        SLG,    0.390, 0.430)
line('OPS',                OPS,    0.700, 0.765, v => v.toFixed(3))
line('BABIP',              BABIP,  0.280, 0.310)
line('K% (삼진율)',         totalSO/totalPA, 0.200, 0.240)
line('BB% (볼넷율)',         totalBB/totalPA, 0.075, 0.095)
line('스윙율',               swingRate, 0.45, 0.52)
line('컨택율(스윙대비)',      contactRate, 0.72, 0.82)
console.log()

// ── 타구 분포 ────────────────────────────────────────────────
console.log('[ 안타 종류 (PA 대비) ]')
function linePA(label, cnt, mlbLow, mlbHigh) {
  const v = cnt / totalPA
  const s = (v * 100).toFixed(1) + '%'
  const m = `${(mlbLow*100).toFixed(1)}~${(mlbHigh*100).toFixed(1)}%`
  const ok = v >= mlbLow && v <= mlbHigh ? '✅' : v < mlbLow ? '🔵LOW' : '🔴HIGH'
  console.log(`  ${label.padEnd(20)} ${s.padStart(8)}  ${m.padStart(8)}  ${ok}   (${cnt}개 / 경기당 ${(cnt/GAMES).toFixed(1)})`)
}
linePA('단타 (1B)',  total1B, 0.145, 0.175)
linePA('2루타 (2B)', total2B, 0.040, 0.060)
linePA('3루타 (3B)', total3B, 0.002, 0.007)
linePA('홈런 (HR)',  totalHR, 0.025, 0.040)
linePA('삼진 (K)',   totalSO, 0.200, 0.240)
linePA('볼넷 (BB)',  totalBB, 0.075, 0.095)
linePA('인플레이 아웃', totalOut, 0.200, 0.270)
console.log()

// ── 득점/주루 ────────────────────────────────────────────────
console.log('[ 득점 / 주루 ]')
// steal_result 기준 성공률 (hit 중단 건 제외한 실제 판정 이벤트만)
const saRate = acc.steal_result_total > 0 ? acc.steal_success / acc.steal_result_total : 0
function lineN(label, sim, mlbLow, mlbHigh, fmt = v => v.toFixed(2)) {
  const s = fmt(sim)
  const m = `${fmt(mlbLow)}~${fmt(mlbHigh)}`
  const ok = sim >= mlbLow && sim <= mlbHigh ? '✅' : sim < mlbLow ? '🔵LOW' : '🔴HIGH'
  console.log(`  ${label.padEnd(22)} ${s.padStart(8)}  ${m.padStart(8)}  ${ok}`)
}
lineN('팀당 평균 득점/경기',  rpgPerTeam, 4.2, 5.5)
lineN('경기당 평균 이닝',     acc.innings / GAMES, 9.0, 9.3)
lineN('도루 성공률',         saRate, 0.74, 0.85, v => (v * 100).toFixed(0) + '%')
lineN('도루 시도/경기',       acc.steal_result_total / GAMES, 0.5, 1.5)
lineN('진루 이벤트/경기',     acc.runner_advance_events / GAMES, 3.0, 8.0)
lineN('포스아웃/경기',        acc.force_out / GAMES, 0.5, 3.0)
lineN('송구 아웃/경기',       acc.runner_out / GAMES, 0.0, 0.8)
lineN('태그업/경기',          acc.tag_up / GAMES, 0.2, 1.5)
console.log()

// ── 원시 타석 결과 ───────────────────────────────────────────
console.log('[ 원시 타석 결과 ]')
for (const [k, v] of Object.entries(res).sort((a, b) => b[1] - a[1])) {
  const pct = ((v / totalPA) * 100).toFixed(1)
  console.log(`  ${k.padEnd(20)} ${String(v).padStart(5)}  (${pct}%  /  경기당 ${(v/GAMES).toFixed(1)})`)
}
console.log()
console.log('='.repeat(62))
