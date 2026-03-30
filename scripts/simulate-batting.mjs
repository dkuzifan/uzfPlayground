/**
 * 100타석 시뮬레이션 — throwPitch → hitBall 체인
 * npx tsx scripts/simulate-batting.mjs
 */

const { throwPitch }       = await import('../src/lib/baseball/engine/throw-pitch.ts')
const { decayFamiliarity } = await import('../src/lib/baseball/engine/familiarity.ts')
const { hitBall }          = await import('../src/lib/baseball/batting/hit-ball.ts')

// ── 선수 데이터 ──────────────────────────────────────────────

// 에이스급 투수 (control=80) — BB% 낮음이 정상
const acePitcher = {
  id: 'p1', team_id: 't1', name: '홍길동(에이스)', number: 11,
  age: 28, bats: 'R', throws: 'R',
  position_1: 'P', position_2: null, position_3: null,
  stats: {
    ball_power: 80, ball_control: 75, ball_break: 70, ball_speed: 85,
    contact: 0, power: 0, defence: 0, throw: 0, running: 0, stamina: 100,
  },
  pitch_types: [
    { type: 'fastball',  weight: 40, ball_power: 85, ball_control: 80, ball_break: 20, ball_speed: 90 },
    { type: 'slider',    weight: 30, ball_power: 65, ball_control: 70, ball_break: 85, ball_speed: 72 },
    { type: 'changeup',  weight: 20, ball_power: 60, ball_control: 75, ball_break: 70, ball_speed: 65 },
    { type: 'curveball', weight: 10, ball_power: 55, ball_control: 65, ball_break: 90, ball_speed: 62 },
  ],
  zone_bottom: 0.55, zone_top: 1.20, portrait_url: null,
}

// 평균급 투수 (control=50) — MLB 평균 BB% 검증용
const avgPitcher = {
  id: 'p2', team_id: 't1', name: '김평범(평균)', number: 22,
  age: 27, bats: 'R', throws: 'R',
  position_1: 'P', position_2: null, position_3: null,
  stats: {
    ball_power: 60, ball_control: 45, ball_break: 55, ball_speed: 65,
    contact: 0, power: 0, defence: 0, throw: 0, running: 0, stamina: 100,
  },
  pitch_types: [
    { type: 'fastball',  weight: 50, ball_power: 65, ball_control: 50, ball_break: 15, ball_speed: 70 },
    { type: 'slider',    weight: 30, ball_power: 55, ball_control: 45, ball_break: 65, ball_speed: 62 },
    { type: 'changeup',  weight: 20, ball_power: 50, ball_control: 50, ball_break: 55, ball_speed: 55 },
  ],
  zone_bottom: 0.55, zone_top: 1.20, portrait_url: null,
}

const batter = {
  id: 'b1', team_id: 't2', name: '이순신', number: 7,
  age: 30, bats: 'R', throws: 'R',
  position_1: 'CF', position_2: null, position_3: null,
  stats: {
    ball_power: 0, ball_control: 0, ball_break: 0, ball_speed: 0,
    contact: 75, power: 70, defence: 80, throw: 65, running: 85, stamina: 100,
  },
  pitch_types: [],
  zone_bottom: 0.55, zone_top: 1.20, portrait_url: null,
}

// ── 시뮬레이션 함수 ──────────────────────────────────────────

function runSimulation(activePitcher, label) {
  const AT_BATS = 1000
  const results = { strikeout: 0, walk: 0, hit_by_pitch: 0,
                    single: 0, double: 0, triple: 0, home_run: 0, out: 0 }
  let total_pitches = 0
  let fair_contacts = 0
  let stamina       = activePitcher.stats.stamina
  let familiarity   = {}
  let ball_pitches = 0
  let strike_pitches = 0
  // 투구 결과 세부 분류
  let called_strikes = 0   // 타자가 가만히 있다가 스트라이크
  let swinging_strikes = 0 // 헛스윙
  let foul_balls = 0       // 파울
  let in_play_hits = 0     // 인플레이 안타
  let in_play_outs = 0     // 인플레이 아웃
  let called_balls = 0     // 타자가 가만히 있다가 볼

  const GAME_SIZE = 27  // 한 경기 아웃카운트 기준 타석 수 (근사)

  for (let ab = 0; ab < AT_BATS; ab++) {
    // 매 경기 시작 시 스태미나 리셋 (투수 교체 시뮬레이션)
    if (ab % GAME_SIZE === 0) {
      stamina     = activePitcher.stats.stamina
      familiarity = {}
    }

    let count          = { balls: 0, strikes: 0 }
    let ab_over        = false
    let recent_pitches = []

    while (!ab_over) {
      const pitchState = {
        pitcher: activePitcher, batter, count,
        outs: 0,
        runners: { first: false, second: false, third: false },
        recent_pitches,
        remaining_stamina: stamina,
        familiarity,
        inning: 1,
        is_scoring_position: false,
      }
      const pitch = throwPitch(pitchState)
      stamina         = pitch.next_stamina
      familiarity     = pitch.next_familiarity
      recent_pitches  = [...recent_pitches, { type: pitch.pitch_type, zone: pitch.actual_zone }].slice(-10)
      total_pitches++
      if (pitch.is_strike) strike_pitches++; else ball_pitches++

      const battingState = {
        pitcher: activePitcher, batter, count,
        outs: 0,
        runners: { first: false, second: false, third: false },
        familiarity,
        inning: 1,
      }
      const batting = hitBall(battingState, pitch)

      count   = batting.next_count
      ab_over = batting.at_bat_over

      // 세부 투구 결과 분류
      if (!batting.swing) {
        if (pitch.is_strike) called_strikes++
        else called_balls++
      } else if (!batting.contact) {
        swinging_strikes++
      } else if (batting.is_foul) {
        foul_balls++
      } else {
        const r = batting.at_bat_result
        if (r === 'single' || r === 'double' || r === 'triple' || r === 'home_run') in_play_hits++
        else in_play_outs++
      }

      if (batting.is_foul === false && batting.contact) fair_contacts++
      if (ab_over) results[batting.at_bat_result] = (results[batting.at_bat_result] ?? 0) + 1
    }

    if (ab % GAME_SIZE !== GAME_SIZE - 1) {
      familiarity = decayFamiliarity(familiarity)
    }
  }

  const pct        = (n) => (n / AT_BATS * 100).toFixed(1) + '%'
  const total_hits = results.single + results.double + results.triple + results.home_run
  const hr_of_fair = fair_contacts > 0
    ? (results.home_run / fair_contacts * 100).toFixed(1) + '%'
    : 'N/A'

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`  ${label} — ${AT_BATS}타석`)
  console.log('═'.repeat(50))
  console.log(`  삼진 (K)        ${String(results.strikeout).padStart(3)}타석  ${pct(results.strikeout).padStart(6)}   [목표: 21~24%]`)
  console.log(`  볼넷 (BB)       ${String(results.walk).padStart(3)}타석  ${pct(results.walk).padStart(6)}   [목표: 7~10%]`)
  console.log(`  사구 (HBP)      ${String(results.hit_by_pitch).padStart(3)}타석  ${pct(results.hit_by_pitch).padStart(6)}`)
  console.log(`  홈런            ${String(results.home_run).padStart(3)}타석  ${pct(results.home_run).padStart(6)}`)
  console.log(`  3루타           ${String(results.triple).padStart(3)}타석  ${pct(results.triple).padStart(6)}`)
  console.log(`  2루타           ${String(results.double).padStart(3)}타석  ${pct(results.double).padStart(6)}`)
  console.log(`  1루타           ${String(results.single).padStart(3)}타석  ${pct(results.single).padStart(6)}`)
  console.log(`  인플레이 아웃   ${String(results.out).padStart(3)}타석  ${pct(results.out).padStart(6)}`)
  console.log(`  ─────────────────────────────────────`)
  console.log(`  안타율 (H/PA)          ${pct(total_hits).padStart(6)}   [목표: 20~24%]`)
  console.log(`  HR/페어컨택            ${hr_of_fair.padStart(6)}   [목표: 3~6%]`)
  console.log(`  평균 투구수/타석       ${(total_pitches / AT_BATS).toFixed(2)}구`)
  const tp = total_pitches
  console.log(`  스트라이크%           ${(strike_pitches / tp * 100).toFixed(1)}%   볼%: ${(ball_pitches / tp * 100).toFixed(1)}%   [MLB: 스트라이크 ~62%]`)
  console.log(`  ─ 투구 결과 세부 ─────────────────────`)
  console.log(`    콜드 스트라이크     ${(called_strikes / tp * 100).toFixed(1)}%`)
  console.log(`    헛스윙             ${(swinging_strikes / tp * 100).toFixed(1)}%`)
  console.log(`    파울               ${(foul_balls / tp * 100).toFixed(1)}%`)
  console.log(`    인플레이 안타      ${(in_play_hits / tp * 100).toFixed(1)}%`)
  console.log(`    인플레이 아웃      ${(in_play_outs / tp * 100).toFixed(1)}%`)
  console.log(`    콜드 볼            ${(called_balls / tp * 100).toFixed(1)}%   [MLB: ~26%]`)
  console.log(`  최종 투수 스태미나     ${stamina.toFixed(1)}`)
}

// ── 실행 ─────────────────────────────────────────────────────

runSimulation(acePitcher,  '에이스 투수 (control=80)')
runSimulation(avgPitcher,  '평균 투수 (control=50)')

console.log('\n완료.\n')
