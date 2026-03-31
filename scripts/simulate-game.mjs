/**
 * 9이닝 게임 시뮬레이션 — 박스 스코어 출력
 * npx tsx scripts/simulate-game.mjs
 */

const { runGame } = await import('../src/lib/baseball/game/game-loop.ts')

// ── 선수 데이터 팩토리 ──────────────────────────────────────────

function makePitcher(id, name, control, stamina = 100) {
  return {
    id, team_id: 't1', name, number: 1,
    age: 28, bats: 'R', throws: 'R',
    position_1: 'P', position_2: null, position_3: null,
    stats: {
      ball_power: 75, ball_control: control, ball_break: 65, ball_speed: 80,
      contact: 0, power: 0, defence: 0, throw: 0, running: 0, stamina,
    },
    pitch_types: [
      { type: 'fastball',  weight: 40, ball_power: 80, ball_control: control,      ball_break: 20, ball_speed: 88 },
      { type: 'slider',    weight: 30, ball_power: 65, ball_control: control - 5,  ball_break: 80, ball_speed: 72 },
      { type: 'changeup',  weight: 20, ball_power: 60, ball_control: control,      ball_break: 65, ball_speed: 64 },
      { type: 'curveball', weight: 10, ball_power: 55, ball_control: control - 10, ball_break: 88, ball_speed: 60 },
    ],
    zone_bottom: 0.55, zone_top: 1.20, portrait_url: null,
  }
}

function makeBatter(id, teamId, name, number, contact, power) {
  return {
    id, team_id: teamId, name, number,
    age: 28, bats: 'R', throws: 'R',
    position_1: 'CF', position_2: null, position_3: null,
    stats: {
      ball_power: 0, ball_control: 0, ball_break: 0, ball_speed: 0,
      contact, power, defence: 70, throw: 65, running: 75, stamina: 100,
    },
    pitch_types: [],
    zone_bottom: 0.55, zone_top: 1.20, portrait_url: null,
  }
}

// ── 라인업 구성 ──────────────────────────────────────────────────

function makeLineup(teamId, prefix, contactBase, powerBase) {
  return Array.from({ length: 9 }, (_, i) =>
    makeBatter(`${teamId}-b${i+1}`, teamId, `${prefix}${i+1}번`, i + 1,
      contactBase + Math.floor(Math.random() * 10) - 5,
      powerBase   + Math.floor(Math.random() * 10) - 5,
    )
  )
}

const homeTeam = {
  lineup:  makeLineup('home', '홈', 72, 68),
  pitcher: makePitcher('home-p', '홈선발', 70, 100),
  bullpen: [
    makePitcher('home-r1', '홈불펜1', 55, 60),
    makePitcher('home-r2', '홈불펜2', 50, 60),
  ],
}

const awayTeam = {
  lineup:  makeLineup('away', '원정', 70, 65),
  pitcher: makePitcher('away-p', '원정선발', 65, 100),
  bullpen: [
    makePitcher('away-r1', '원정불펜1', 52, 60),
    makePitcher('away-r2', '원정불펜2', 48, 60),
  ],
}

// ── 게임 실행 ────────────────────────────────────────────────────

console.log('='.repeat(60))
console.log('  야구 시뮬레이터 — 9이닝 게임 시뮬레이션')
console.log('='.repeat(60))
console.log()

const result = runGame(homeTeam, awayTeam)

// ── 박스 스코어 출력 ────────────────────────────────────────────

const { winner, score, linescore, reason, events } = result

// 라인스코어 헤더
const innings = linescore.away.length
const header  = '      ' + Array.from({ length: innings }, (_, i) => String(i + 1).padStart(3)).join('') + '   R'
console.log(header)
console.log('-'.repeat(header.length))

const awayLine = 'Away: ' + linescore.away.map(r => String(r).padStart(3)).join('') + '  ' + String(score.away).padStart(2)
const homeLine = 'Home: ' + linescore.home.map(r => String(r).padStart(3)).join('') + '  ' + String(score.home).padStart(2)
console.log(awayLine)
console.log(homeLine)
console.log()

// 최종 결과
const winnerStr = winner === 'home' ? `Home (${score.home}-${score.away})` :
                  winner === 'away' ? `Away (${score.away}-${score.home})` :
                  `Draw (${score.home}-${score.away})`
console.log(`승자: ${winnerStr}   사유: ${reason}   이닝수: ${innings}`)
console.log()

// 이벤트 요약
const eventCounts = {}
for (const e of events) {
  eventCounts[e.type] = (eventCounts[e.type] ?? 0) + 1
}
console.log('이벤트 요약:')
for (const [type, count] of Object.entries(eventCounts)) {
  console.log(`  ${type.padEnd(18)} ${count}`)
}
console.log()

// at_bat_result 집계
const atBatResults = {}
for (const e of events) {
  if (e.type !== 'at_bat_result') continue
  const r = e.payload.result
  atBatResults[r] = (atBatResults[r] ?? 0) + 1
}
const totalAB = Object.values(atBatResults).reduce((a, b) => a + b, 0)
console.log(`타석 결과 (총 ${totalAB}타석):`)
for (const [result, count] of Object.entries(atBatResults).sort((a, b) => b[1] - a[1])) {
  const pct = ((count / totalAB) * 100).toFixed(1)
  console.log(`  ${result.padEnd(16)} ${String(count).padStart(3)}  (${pct}%)`)
}
console.log()

// 이닝별 득점 이벤트 (score events)
const scoreEvents = events.filter(e => e.type === 'score')
if (scoreEvents.length > 0) {
  console.log('득점 장면:')
  for (const e of scoreEvents) {
    const side = e.isTop ? '원정' : '홈  '
    const { runs_scored, runs_total_home, runs_total_away } = e.payload
    console.log(`  ${e.inning}회 ${side}: ${runs_scored}점 (홈${runs_total_home}-원정${runs_total_away})`)
  }
}
console.log()
console.log('='.repeat(60))

// ── 다경기 시뮬레이션 ───────────────────────────────────────────

const GAMES = 100
let homeWins = 0, awayWins = 0, draws = 0
let totalInnings = 0
const resultCounts = {}

console.log(`\n${GAMES}경기 시뮬레이션 중...`)

for (let g = 0; g < GAMES; g++) {
  const ht = {
    lineup:  makeLineup('home', '홈', 72, 68),
    pitcher: makePitcher('home-p', '홈선발', 70, 100),
    bullpen: [makePitcher('home-r1', '홈불펜1', 55, 60), makePitcher('home-r2', '홈불펜2', 50, 60)],
  }
  const at = {
    lineup:  makeLineup('away', '원정', 70, 65),
    pitcher: makePitcher('away-p', '원정선발', 65, 100),
    bullpen: [makePitcher('away-r1', '원정불펜1', 52, 60), makePitcher('away-r2', '원정불펜2', 48, 60)],
  }
  const r  = runGame(ht, at)

  if (r.winner === 'home')      homeWins++
  else if (r.winner === 'away') awayWins++
  else                          draws++

  totalInnings += r.linescore.away.length

  // 평균 득점
  resultCounts.homeScore = (resultCounts.homeScore ?? 0) + r.score.home
  resultCounts.awayScore = (resultCounts.awayScore ?? 0) + r.score.away
}

console.log()
console.log(`${GAMES}경기 결과:`)
console.log(`  홈팀 승: ${homeWins}  원정팀 승: ${awayWins}  무승부: ${draws}`)
console.log(`  평균 이닝수:       ${(totalInnings / GAMES).toFixed(2)}`)
console.log(`  홈팀 평균 득점:    ${(resultCounts.homeScore / GAMES).toFixed(2)}`)
console.log(`  원정팀 평균 득점:  ${(resultCounts.awayScore / GAMES).toFixed(2)}`)
console.log()
