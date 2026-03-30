/**
 * 100투구 시뮬레이션 스크립트
 * npx tsx scripts/simulate-pitches.mjs
 */

import { createRequire } from 'module'
import { register }      from 'node:module'
import { pathToFileURL } from 'node:url'

// tsx/ts-node 환경에서 실행 가정
// npx tsx scripts/simulate-pitches.mjs

const { throwPitch }       = await import('../src/lib/baseball/engine/throw-pitch.ts')
const { decayFamiliarity } = await import('../src/lib/baseball/engine/familiarity.ts')

// ── 테스트용 선수 데이터 ──────────────────────────────────────
const pitcher = {
  id: 'p1', team_id: 't1', name: '홍길동', number: 11,
  age: 28, bats: 'R', throws: 'R',
  position_1: 'P', position_2: null, position_3: null,
  stats: {
    ball_power: 80, ball_control: 75, ball_break: 70, ball_speed: 85,
    contact: 0, power: 0, defence: 0, throw: 0, running: 0,
    stamina: 100,
  },
  pitch_types: [
    { type: 'fastball',  weight: 40, ball_power: 85, ball_control: 80, ball_break: 20, ball_speed: 90 },
    { type: 'slider',    weight: 30, ball_power: 65, ball_control: 70, ball_break: 85, ball_speed: 72 },
    { type: 'changeup',  weight: 20, ball_power: 60, ball_control: 75, ball_break: 70, ball_speed: 65 },
    { type: 'curveball', weight: 10, ball_power: 55, ball_control: 65, ball_break: 90, ball_speed: 62 },
  ],
  zone_bottom: 0.55,
  zone_top: 1.20,
  portrait_url: null,
}

const batter = {
  id: 'b1', team_id: 't2', name: '이순신', number: 7,
  age: 30, bats: 'R', throws: 'R',
  position_1: 'CF', position_2: null, position_3: null,
  stats: {
    ball_power: 0, ball_control: 0, ball_break: 0, ball_speed: 0,
    contact: 75, power: 70, defence: 80, throw: 65, running: 85,
    stamina: 100,
  },
  pitch_types: [],
  zone_bottom: 0.55,
  zone_top: 1.20,
  portrait_url: null,
}

// ── 시뮬레이션 ───────────────────────────────────────────────
const N = 100
const pitchTypeCounts   = {}
const zoneCounts        = {}
const zoneTypeCounts    = {}
let hbpCount     = 0
let strikeCount  = 0
let reliefNeeded = false

let state = {
  pitcher, batter,
  count: { balls: 0, strikes: 0 },
  outs: 0,
  runners: { first: false, second: false, third: false },
  recent_pitches: [],
  remaining_stamina: 100,
  familiarity: {},
  inning: 1,
  is_scoring_position: false,
}

for (let i = 0; i < N; i++) {
  const result = throwPitch(state)

  // 통계 집계
  pitchTypeCounts[result.pitch_type] = (pitchTypeCounts[result.pitch_type] ?? 0) + 1
  zoneCounts[result.actual_zone]     = (zoneCounts[result.actual_zone]     ?? 0) + 1
  zoneTypeCounts[result.zone_type]   = (zoneTypeCounts[result.zone_type]   ?? 0) + 1
  if (result.is_hbp)    hbpCount++
  if (result.is_strike) strikeCount++
  if (result.needs_relief) reliefNeeded = true

  // 상태 업데이트
  state = {
    ...state,
    remaining_stamina: result.next_stamina,
    familiarity: result.next_familiarity,
    recent_pitches: [...state.recent_pitches, { type: result.pitch_type, zone: result.actual_zone }].slice(-10),
  }
}

// ── 결과 출력 ────────────────────────────────────────────────
console.log(`\n=== ${N}투구 시뮬레이션 결과 ===\n`)

console.log('[ 구종 분포 ]')
for (const [type, cnt] of Object.entries(pitchTypeCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type.padEnd(12)} ${cnt}구 (${(cnt / N * 100).toFixed(1)}%)`)
}

console.log('\n[ 존 타입 분포 ]')
for (const [type, cnt] of Object.entries(zoneTypeCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type.padEnd(8)} ${cnt}구 (${(cnt / N * 100).toFixed(1)}%)`)
}

console.log(`\n[ 핵심 지표 ]`)
console.log(`  스트라이크 비율: ${(strikeCount / N * 100).toFixed(1)}%`)
console.log(`  HBP            : ${hbpCount}회`)
console.log(`  최종 스태미나  : ${state.remaining_stamina.toFixed(1)}`)
console.log(`  강판 필요      : ${reliefNeeded}`)

// ── decayFamiliarity 검증 ────────────────────────────────────
const decayed = decayFamiliarity(state.familiarity)
const samplePitch = Object.keys(state.familiarity)[0]
if (samplePitch) {
  const sampleZone = Object.keys(state.familiarity[samplePitch])[0]
  const before = state.familiarity[samplePitch][sampleZone]
  const after  = decayed[samplePitch]?.[sampleZone]
  console.log(`\n[ decayFamiliarity 검증 ]`)
  console.log(`  ${samplePitch}/${sampleZone}: ${before?.toFixed(3)} → ${after?.toFixed(3)} (기대: ${(before * 0.2).toFixed(3)})`)
}

console.log('\n완료.\n')
