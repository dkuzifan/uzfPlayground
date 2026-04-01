/**
 * Running 스탯 차별화 — 외야 단타에서 타자 2루 진출률 비교
 */
const { runGame } = await import('../src/lib/baseball/game/game-loop.ts')

function makeTeam(id, running, throwStat) {
  const positions = ['1B','2B','SS','3B','LF','CF','RF','C','P']
  const base = {
    team_id: id, number: 1, age: 28, bats: 'R', throws: 'R',
    position_2: null, position_3: null,
    stats: { ball_power:70, ball_control:70, ball_break:65, ball_speed:80,
             contact:70, power:70, defence:70, throw: throwStat, running, stamina:100 },
    pitch_types: [
      { type:'fastball', weight:60, ball_power:75, ball_control:70, ball_break:20, ball_speed:88 },
      { type:'slider',   weight:40, ball_power:65, ball_control:65, ball_break:50, ball_speed:80 },
    ],
    zone_bottom: 0.5, zone_top: 1.1, portrait_url: null,
  }
  const pitcher = { ...base, id:`${id}_p`, name:'투수', position_1:'P' }
  const lineup  = positions.map((pos, i) => ({ ...base, id:`${id}_${i}`, name:`${i+1}번`, position_1: pos }))
  return { id, name: `팀R${running}T${throwStat}`, lineup, pitcher, bullpen:[] }
}

const N = 500
// away팀이 Running 50/80로 TOP 이닝에서 타격 (isTop=true)
// home팀은 Throw 70 수비
let singles50 = 0, singles80 = 0
let single2B50 = 0, single2B80 = 0

console.log(`${N}경기 시뮬레이션 중...`)

for (let i = 0; i < N; i++) {
  // away=R50 타격, home=T70 수비
  const g50 = runGame(makeTeam('hdef', 70, 70), makeTeam('r50', 50, 70))
  // away=R80 타격, home=T70 수비
  const g80 = runGame(makeTeam('hdef2', 70, 70), makeTeam('r80', 80, 70))

  // TOP(isTop=true) = away팀 타격
  for (const e of g50.events) {
    if (!e.isTop) continue
    if (e.type === 'at_bat_result' && e.payload.result === 'single') singles50++
    if (e.type === 'runner_advance') {
      for (const m of e.payload.moves) {
        if (m.from === 'batter' && m.to === 2) single2B50++
      }
    }
  }
  for (const e of g80.events) {
    if (!e.isTop) continue
    if (e.type === 'at_bat_result' && e.payload.result === 'single') singles80++
    if (e.type === 'runner_advance') {
      for (const m of e.payload.moves) {
        if (m.from === 'batter' && m.to === 2) single2B80++
      }
    }
  }
}

const rate50 = singles50 > 0 ? (single2B50 / singles50 * 100).toFixed(1) : '?'
const rate80 = singles80 > 0 ? (single2B80 / singles80 * 100).toFixed(1) : '?'

console.log(`\n=== Running 스탯 — 단타 후 타자 2루 진출률 ===`)
console.log(`Running 50: 단타 ${singles50}개 중 2루 진출 ${single2B50}회 = ${rate50}%`)
console.log(`Running 80: 단타 ${singles80}개 중 2루 진출 ${single2B80}회 = ${rate80}%`)
