/**
 * 송구 판정 #2 스탯 차별화 검증
 * npx tsx scripts/test-throw-stats.mjs
 */
const { runGame } = await import('../src/lib/baseball/game/game-loop.ts')

function makePlayer(id, name, pos, running, throwStat, teamId) {
  return {
    id, team_id: teamId, name, number: 1, age: 28,
    bats: 'R', throws: 'R',
    position_1: pos, position_2: null, position_3: null,
    stats: {
      ball_power: 70, ball_control: 70, ball_break: 65, ball_speed: 80,
      contact: 70, power: 70, defence: 70, throw: throwStat, running, stamina: 100,
    },
    pitch_types: [
      { type: 'fastball', weight: 60, ball_power: 75, ball_control: 70, ball_break: 20, ball_speed: 88 },
      { type: 'slider',   weight: 40, ball_power: 65, ball_control: 65, ball_break: 50, ball_speed: 80 },
    ],
    zone_bottom: 0.5, zone_top: 1.1, portrait_url: null,
  }
}

function makeTeam(id, running, throwStat) {
  const positions = ['1B','2B','SS','3B','LF','CF','RF','C','P']
  const pitcher = makePlayer(`${id}_p`, '투수', 'P', running, throwStat, id)
  const lineup = positions.map((pos, i) =>
    makePlayer(`${id}_${i}`, `${i+1}번`, pos, running, throwStat, id)
  )
  return { id, name: `팀R${running}T${throwStat}`, lineup, pitcher, bullpen: [] }
}

function countExtra2B(events, teamId) {
  let count = 0
  for (const e of events) {
    if (e.type === 'runner_advance') {
      for (const m of e.payload.moves) {
        if (m.from === 'batter' && m.to === 2) count++
      }
    }
  }
  return count
}

const N = 500
let extra50 = 0, extra80 = 0
let runsA = 0, runsB = 0   // Throw 50 vs Throw 80 수비팀 허용 득점

console.log(`${N}경기 시뮬레이션 중...`)

for (let i = 0; i < N; i++) {
  // Running 50 vs Running 80 (타격팀, 수비팀 Throw 70 고정)
  const gRun = runGame(makeTeam('bat', 70, 70), makeTeam('def', 70, 70))
  const gR50 = runGame(makeTeam('r50', 50, 70), makeTeam('def2', 70, 70))
  const gR80 = runGame(makeTeam('r80', 80, 70), makeTeam('def3', 70, 70))
  extra50 += countExtra2B(gR50.events)
  extra80 += countExtra2B(gR80.events)

  // Throw 50 vs Throw 80 수비팀 (타격팀 Running 70 고정)
  const gT50 = runGame(makeTeam('bat50', 70, 70), makeTeam('t50', 70, 50))
  const gT80 = runGame(makeTeam('bat80', 70, 70), makeTeam('t80', 70, 80))
  runsA += gT50.score.away  // Throw 50 수비팀 허용 득점
  runsB += gT80.score.away  // Throw 80 수비팀 허용 득점
}

console.log(`\n=== Running 스탯 차별화 ===`)
console.log(`Running 50 타자 2루 진출 합계: ${extra50}  (평균 ${(extra50/N).toFixed(2)}/경기)`)
console.log(`Running 80 타자 2루 진출 합계: ${extra80}  (평균 ${(extra80/N).toFixed(2)}/경기)`)
if (extra50 > 0) console.log(`→ Running 80이 ${((extra80/extra50 - 1)*100).toFixed(0)}% 더 많음 (목표: 양수)`)

console.log(`\n=== Throw 스탯 차별화 ===`)
console.log(`Throw 50 수비팀 상대 평균 허용 득점: ${(runsA/N).toFixed(2)}`)
console.log(`Throw 80 수비팀 상대 평균 허용 득점: ${(runsB/N).toFixed(2)}`)
if (runsA > 0) console.log(`→ Throw 80 수비팀이 ${((1 - runsB/runsA)*100).toFixed(0)}% 더 적게 허용 (목표: 양수)`)
