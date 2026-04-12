/**
 * Step 9 3-0 구위 트레이드오프 단위 검증
 * npx tsx scripts/test-power-tradeoff.mjs
 */

const { throwPitch } = await import('../src/lib/baseball/engine/throw-pitch.ts')
const { findMinimalPowerReduction, calcPStrike } = await import('../src/lib/baseball/engine/power-tradeoff.ts')

function makePitcher(control = 50) {
  return {
    id: 'p1', team_id: 't1', name: '투수', number: 1,
    age: 28, bats: 'R', throws: 'R',
    position_1: 'P', position_2: null, position_3: null,
    stats: { ball_power: 70, ball_control: control, ball_break: 60, ball_speed: 80,
             contact: 0, power: 0, defence: 70, throw: 65, running: 50, stamina: 100 },
    pitch_types: [
      { type: 'fastball', weight: 40, ball_power: 80, ball_control: control, ball_break: 20, ball_speed: 88 },
      { type: 'slider',   weight: 30, ball_power: 65, ball_control: control - 5, ball_break: 80, ball_speed: 72 },
    ],
    zone_bottom: 0.55, zone_top: 1.20, portrait_url: null,
  }
}

function makeBatter(power = 50) {
  return {
    id: 'b1', team_id: 't2', name: '타자', number: 5,
    age: 27, bats: 'R', throws: 'R',
    position_1: 'CF', position_2: null, position_3: null,
    stats: { ball_power: 0, ball_control: 0, ball_break: 0, ball_speed: 0,
             contact: 70, power, eye: 60, defence: 70, throw: 60, running: 60, stamina: 100 },
    pitch_types: [],
    zone_bottom: 0.55, zone_top: 1.20, portrait_url: null,
  }
}

// ────────────────────────────────────────────────────────────
// 단위 테스트 1: findMinimalPowerReduction
// ────────────────────────────────────────────────────────────
console.log('=== Step 9 단위 검증: findMinimalPowerReduction ===\n')

const batter = makeBatter()

const cases = [
  { name: '한복판 타겟, σ=0.11',      tx:  0.00, tz: 0.875, sx: 0.110, sz: 0.077 },
  { name: '좌상 코너, σ=0.11',        tx: -0.14, tz: 1.090, sx: 0.110, sz: 0.077 },
  { name: '좌상 코너, σ=0.155 (제구30)', tx: -0.14, tz: 1.090, sx: 0.155, sz: 0.108 },
  { name: '존 경계 아슬, σ=0.17 (제구20)', tx: -0.30, tz: 1.200, sx: 0.170, sz: 0.119 },
  { name: '바닥 코너, σ=0.17',        tx:  0.14, tz: 0.660, sx: 0.170, sz: 0.119 },
]

for (const c of cases) {
  const p0 = calcPStrike(c.tx, c.tz, c.sx, c.sz, batter)
  const { k, p_strike } = findMinimalPowerReduction(c.tx, c.tz, c.sx, c.sz, batter)
  console.log(
    `${c.name.padEnd(28)} P(1.0)=${p0.toFixed(3)}  →  k=${k.toFixed(3)}  P(k)=${p_strike.toFixed(3)}`
  )
}

// ────────────────────────────────────────────────────────────
// 단위 테스트 2: 3-0 카운트 throwPitch — 1000회 샘플
// ────────────────────────────────────────────────────────────
console.log('\n=== Step 9 통합: 3-0 카운트 1000구 시뮬 ===\n')

function simulate3_0(label, pitcher) {
  const batter = makeBatter()
  const state = {
    pitcher, batter,
    count: { balls: 3, strikes: 0 },
    outs: 0,
    runners: { first: false, second: false, third: false },
    recent_pitches: [],
    remaining_stamina: 100,
    familiarity: {},
    inning: 1,
    is_scoring_position: false,
  }

  const stats = {
    total: 0, strike: 0, ball: 0, hbp: 0,
    zoneCount: {},
    pitchType: {},
    powerReduction: { mean: 0, min: 1, max: 0, anyReduced: 0 },
  }

  for (let i = 0; i < 1000; i++) {
    const r = throwPitch(state)
    stats.total++
    if (r.is_hbp) stats.hbp++
    else if (r.is_strike) stats.strike++
    else stats.ball++

    stats.zoneCount[r.zone_type] = (stats.zoneCount[r.zone_type] ?? 0) + 1
    stats.pitchType[r.pitch_type] = (stats.pitchType[r.pitch_type] ?? 0) + 1

    const baseBp = pitcher.pitch_types.find(pt => pt.type === r.pitch_type).ball_power
    const k = (r.effective_ball_power ?? baseBp) / baseBp
    stats.powerReduction.mean += k
    stats.powerReduction.min = Math.min(stats.powerReduction.min, k)
    stats.powerReduction.max = Math.max(stats.powerReduction.max, k)
    if (r.effective_ball_power !== undefined) stats.powerReduction.anyReduced++
  }

  stats.powerReduction.mean /= stats.total

  console.log(`[${label}]`)
  console.log(`  strike: ${(stats.strike/stats.total*100).toFixed(1)}%  ball: ${(stats.ball/stats.total*100).toFixed(1)}%  hbp: ${stats.hbp}`)
  console.log(`  pitch types:`, Object.entries(stats.pitchType).map(([k,v]) => `${k}:${(v/stats.total*100).toFixed(0)}%`).join(' '))
  console.log(`  zone_type  :`, Object.entries(stats.zoneCount).map(([k,v]) => `${k}:${(v/stats.total*100).toFixed(0)}%`).join(' '))
  console.log(`  k average  : ${stats.powerReduction.mean.toFixed(3)}  (min ${stats.powerReduction.min.toFixed(3)}, max ${stats.powerReduction.max.toFixed(3)})`)
  console.log(`  reduced  ${stats.powerReduction.anyReduced}/${stats.total}구 (${(stats.powerReduction.anyReduced/stats.total*100).toFixed(1)}%)`)
  console.log()
}

simulate3_0('제구 80 투수', makePitcher(80))
simulate3_0('제구 50 투수', makePitcher(50))
simulate3_0('제구 30 투수', makePitcher(30))
