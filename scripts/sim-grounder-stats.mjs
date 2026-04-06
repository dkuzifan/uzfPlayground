/**
 * 땅볼 타구 상세 통계
 * npx tsx scripts/sim-grounder-stats.mjs
 */

const { runGame } = await import('../src/lib/baseball/game/game-loop.ts')

// ── 선수 팩토리 (sim-calibration과 동일) ─────────────────────

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

// ── 방향각 → 구역 분류 ───────────────────────────────────────
// theta_h: 0=중견수, +=우측, -=좌측 (도)
// 내야 기준 방향 구역
function classifyDirection(theta_h) {
  if (theta_h === undefined || theta_h === null) return 'unknown'
  const t = theta_h
  if (t < -45)          return '3루선 파울 근처 / 좌측 파울'
  if (t < -22)          return '3루-유격수 방향'
  if (t < -5)           return '유격수-2루 방향'
  if (t <= 5)           return '투수-2루 중앙'
  if (t <= 22)          return '2루-1루 방향'
  if (t <= 45)          return '1루-2루수 방향'
  return '1루선 파울 근처 / 우측 파울'
}

// ── 수집기 ────────────────────────────────────────────────────
const GAMES = 500

const grounders = []  // { theta_h, fielder_pos, result, range }

console.log(`\n${GAMES}경기 시뮬레이션 중 (땅볼 분석)...`)

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

  for (const e of r.events) {
    if (e.type !== 'at_bat_result') continue
    if (e.payload.ball_type !== 'grounder') continue

    grounders.push({
      theta_h:     e.payload.theta_h ?? null,
      fielder_pos: e.payload.fielder?.position_1 ?? 'unknown',
      result:      e.payload.result,
      range:       e.payload.range ?? null,
    })
  }
}

const total = grounders.length
console.log(`\n총 땅볼 타구: ${total}개 (경기당 ${(total / GAMES).toFixed(1)}개)\n`)
console.log('='.repeat(62))

// ── 1. 수비수(포지션)별 처리 비율 ────────────────────────────
console.log('\n[ 1. 수비수(포지션)별 처리 비율 ]')
const byFielder = {}
for (const g of grounders) {
  const pos = g.fielder_pos
  byFielder[pos] = (byFielder[pos] ?? 0) + 1
}
const fielderOrder = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'unknown']
console.log(`  ${'포지션'.padEnd(10)} ${'건수'.padStart(6)}  ${'비율'.padStart(7)}`)
console.log('  ' + '-'.repeat(28))
for (const pos of fielderOrder) {
  const cnt = byFielder[pos] ?? 0
  if (cnt === 0) continue
  const pct = (cnt / total * 100).toFixed(1)
  console.log(`  ${pos.padEnd(10)} ${String(cnt).padStart(6)}  ${(pct + '%').padStart(7)}`)
}

// ── 2. 방향별 발생 비율 ──────────────────────────────────────
console.log('\n[ 2. 방향별 발생 비율 (theta_h 기준) ]')
const byDir = {}
for (const g of grounders) {
  const dir = classifyDirection(g.theta_h)
  byDir[dir] = (byDir[dir] ?? 0) + 1
}
const dirOrder = [
  '3루-유격수 방향',
  '유격수-2루 방향',
  '투수-2루 중앙',
  '2루-1루 방향',
  '1루-2루수 방향',
  '3루선 파울 근처 / 좌측 파울',
  '1루선 파울 근처 / 우측 파울',
  'unknown',
]
console.log(`  ${'방향'.padEnd(28)} ${'건수'.padStart(6)}  ${'비율'.padStart(7)}`)
console.log('  ' + '-'.repeat(46))
for (const dir of dirOrder) {
  const cnt = byDir[dir] ?? 0
  if (cnt === 0) continue
  const pct = (cnt / total * 100).toFixed(1)
  console.log(`  ${dir.padEnd(28)} ${String(cnt).padStart(6)}  ${(pct + '%').padStart(7)}`)
}

// ── 3. 땅볼 타구 중 안타 비율 (포지션별) ──────────────────────
console.log('\n[ 3. 땅볼 타구 안타 여부 (포지션별) ]')
const HIT_RESULTS = new Set(['single', 'double', 'triple', 'reach_on_error'])
const byFielderHit = {}
for (const g of grounders) {
  const pos = g.fielder_pos
  if (!byFielderHit[pos]) byFielderHit[pos] = { hit: 0, out: 0 }
  if (HIT_RESULTS.has(g.result)) byFielderHit[pos].hit++
  else byFielderHit[pos].out++
}
console.log(`  ${'포지션'.padEnd(10)} ${'총'.padStart(5)} ${'안타'.padStart(6)} ${'히트율'.padStart(8)}`)
console.log('  ' + '-'.repeat(34))
for (const pos of fielderOrder) {
  const d = byFielderHit[pos]
  if (!d) continue
  const tot = d.hit + d.out
  const pct = (d.hit / tot * 100).toFixed(1)
  console.log(`  ${pos.padEnd(10)} ${String(tot).padStart(5)} ${String(d.hit).padStart(6)} ${(pct + '%').padStart(8)}`)
}

// 전체 땅볼 안타율
const totalHits = grounders.filter(g => HIT_RESULTS.has(g.result)).length
console.log(`\n  전체 땅볼 안타율: ${(totalHits / total * 100).toFixed(1)}% (${totalHits}/${total})`)
console.log(`  (MLB 땅볼 BABIP 기준 ~24% 수준)`)

// ── 4. 착지 거리(range) 분포 (5m 단위) ──────────────────────
console.log('\n[ 4. 땅볼 착지 거리 분포 (홈플레이트 기준, 5m 단위) ]')
const rangeBuckets = {}
const validRanges = grounders.filter(g => g.range !== null)
for (const g of validRanges) {
  const bucket = Math.floor(g.range / 5) * 5
  const key = `${bucket}~${bucket + 5}m`
  rangeBuckets[key] = (rangeBuckets[key] ?? 0) + 1
}
// 정렬 (숫자 순)
const sortedBuckets = Object.keys(rangeBuckets).sort((a, b) => {
  const aStart = parseInt(a)
  const bStart = parseInt(b)
  return aStart - bStart
})
console.log(`  (유효 샘플: ${validRanges.length}개)`)
console.log(`  ${'거리 구간'.padEnd(12)} ${'건수'.padStart(6)}  ${'비율'.padStart(7)}`)
console.log('  ' + '-'.repeat(30))
for (const key of sortedBuckets) {
  const cnt = rangeBuckets[key]
  const pct = (cnt / validRanges.length * 100).toFixed(1)
  const bar = '█'.repeat(Math.round(cnt / validRanges.length * 40))
  console.log(`  ${key.padEnd(12)} ${String(cnt).padStart(6)}  ${(pct + '%').padStart(7)}  ${bar}`)
}

// ── 5. theta_h 분포 히스토그램 (10도 단위) ───────────────────
console.log('\n[ 5. 방향각 분포 (10도 단위, 0=중견수 방향) ]')
const thetaBuckets = {}
const validTheta = grounders.filter(g => g.theta_h !== null)
for (const g of validTheta) {
  const bucket = Math.floor(g.theta_h / 10) * 10
  const key = `${bucket >= 0 ? '+' : ''}${bucket}°`
  thetaBuckets[key] = (thetaBuckets[key] ?? 0) + 1
}
const sortedTheta = Object.keys(thetaBuckets).sort((a, b) => parseFloat(a) - parseFloat(b))
console.log(`  ${'방향각 구간'.padEnd(12)} ${'건수'.padStart(6)}  ${'비율'.padStart(7)}`)
console.log('  ' + '-'.repeat(30))
for (const key of sortedTheta) {
  const cnt = thetaBuckets[key]
  const pct = (cnt / validTheta.length * 100).toFixed(1)
  const bar = '█'.repeat(Math.round(cnt / validTheta.length * 40))
  console.log(`  ${key.padEnd(12)} ${String(cnt).padStart(6)}  ${(pct + '%').padStart(7)}  ${bar}`)
}

console.log('\n' + '='.repeat(62))
