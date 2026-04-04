---
title: Tech Spec — 러너 애니메이션 다이아몬드
date: 2026-04-04
prd: docs/baseball/prd/260404-runner-animation.md
---

## 수정 파일 목록

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/lib/baseball/game/derive-state.ts` | 수정 | `LiveGameState`에 `lastAnimEvent` 추가 |
| `src/hooks/baseball/useGamePlayback.ts` | 수정 | `nextUnitEnd` — 도루를 중간 경계로 처리 |
| `src/app/arena/baseball/game/page.tsx` | 수정 | `ZoneFooter` 제거, `RunnerDiamond` 컴포넌트 추가, 레이아웃 재배치 |

DB 변경 없음. 신규 파일 없음.

---

## 1. derive-state.ts — `lastAnimEvent` 추가

### 목적

`RunnerDiamond`가 어떤 이동을 애니메이션으로 표현해야 하는지 알 수 있도록,
가장 최근에 발생한 주자 이동 이벤트를 `LiveGameState`에 포함한다.

### 타입 변경

```typescript
// 기존
export interface LiveGameState {
  ...
  runners: { first: boolean; second: boolean; third: boolean }
  ...
}

// 변경 후
export type RunnerAnimEvent =
  | { type: 'runner_advance'; moves: Array<{ from: 1|2|3|'batter'; to: 1|2|3|'home' }> }
  | { type: 'steal_attempt';  from: 1|2; to: 2|3 }
  | { type: 'steal_result';   from: 1|2; to: 2|3|'home'; success: boolean }
  | { type: 'tag_up';         from: 1|2|3; to: 1|2|3|'home'; safe: boolean }

export interface LiveGameState {
  ...
  runners:       { first: boolean; second: boolean; third: boolean }
  lastAnimEvent: RunnerAnimEvent | null   // ← 추가
  animSeq:       number                  // ← 추가: 이벤트 변경 감지용 단조증가 카운터
  ...
}
```

### deriveState 로직 변경

```typescript
// 초기값
let lastAnimEvent: RunnerAnimEvent | null = null
let animSeq = 0

// 이벤트 처리
case 'runner_advance': {
  // 기존 runners 갱신 로직 유지
  ...
  lastAnimEvent = { type: 'runner_advance', moves: p.moves }
  animSeq++
  break
}
case 'steal_attempt': {
  const p = ev.payload as { from: 1|2; to: 2|3 }
  lastAnimEvent = { type: 'steal_attempt', from: p.from, to: p.to }
  animSeq++
  break
}
case 'steal_result': {
  const p = ev.payload as { from: 1|2; to: 2|3|'home'; success: boolean }
  if (!p.success) outs++   // 기존 로직
  lastAnimEvent = { type: 'steal_result', from: p.from, to: p.to, success: p.success }
  animSeq++
  break
}
case 'tag_up': {
  const p = ev.payload as { from: 1|2|3; to: 1|2|3|'home'; safe: boolean }
  lastAnimEvent = { type: 'tag_up', from: p.from, to: p.to, safe: p.safe }
  animSeq++
  break
}
```

---

## 2. useGamePlayback.ts — `nextUnitEnd` 도루 중간 경계 처리

### 변경 전

```typescript
function nextUnitEnd(events, from, unit) {
  if (unit === 'pitch') return from + 1
  for (let i = from; i < events.length; i++) {
    if (events[i].type === 'at_bat_result') return i + 1
  }
  return events.length
}
```

### 변경 후

```typescript
function nextUnitEnd(events, from, unit) {
  if (unit === 'pitch') return from + 1

  // at_bat 모드: at_bat_result 이전에 steal_attempt가 있으면
  // steal_result 직후를 중간 경계로 반환
  for (let i = from; i < events.length; i++) {
    if (events[i].type === 'steal_attempt') {
      for (let j = i + 1; j < events.length; j++) {
        if (events[j].type === 'steal_result') return j + 1
        if (events[j].type === 'at_bat_result') break  // steal_result 없이 at_bat_result 도달 시 fallthrough
      }
    }
    if (events[i].type === 'at_bat_result') return i + 1
  }
  return events.length
}
```

---

## 3. game/page.tsx — RunnerDiamond 컴포넌트 + 레이아웃 재배치

### 레이아웃 변경

```
// 기존 LiveTab 좌측 패널 순서
ZoneStatus      (이닝 + 아웃)
ZoneVisual      (스트라이크존)
ZoneFooter      (소형 다이아몬드 + B/S 카운트)  ← 제거
MatchupBar
ControlBar

// 변경 후
ZoneStatus      (이닝 + 아웃)
ZoneVisual      (스트라이크존)
RunnerDiamond   (대형 다이아몬드, 애니메이션)   ← 신규
CountBar        (B/S 카운트만 — ZoneFooter에서 분리)
MatchupBar
ControlBar
```

### RunnerDiamond 컴포넌트 설계

```typescript
interface RunnerDot {
  id:      number
  posKey:  string    // 현재 표시 위치 키 ('batter'|'1'|'2'|'3'|'home')
  opacity: number    // 1 | 0 (페이드 중)
}

function RunnerDiamond({
  runners,        // { first, second, third } — 최종 settled 상태
  lastAnimEvent,  // RunnerAnimEvent | null
  animSeq,        // number — 변경 감지용
}: { ... })
```

#### 내부 상태 관리

- `dots: RunnerDot[]` — 현재 화면에 표시 중인 도트 배열 (React state)
- `useEffect([animSeq])` — animSeq 변화 감지 → `lastAnimEvent` 처리

#### animSeq 변화 시 처리 흐름

```
lastAnimEvent.type === 'runner_advance':
  moves 순회 → 각 dot을 from에서 to로 이동
  to === 'home' → 이동 완료 후 fadeOut
  from === 'batter' → uid 채번 후 신규 dot 생성

lastAnimEvent.type === 'steal_attempt':
  from 베이스 dot을 to 방향으로 이동 시작

lastAnimEvent.type === 'steal_result':
  success → to 위치에 도착 (이미 steal_attempt로 이동 중)
  !success → to 위치 도달 후 fadeOut

lastAnimEvent.type === 'tag_up':
  safe → to 위치로 이동
  !safe → 현재 위치에서 fadeOut
```

#### 경유 베이스 waypoint 계산

```typescript
const BASE_ORDER = ['batter', '1', '2', '3', 'home'] as const

function getWaypoints(from: string, to: string): string[] {
  const fi = BASE_ORDER.indexOf(from as any)
  const ti = BASE_ORDER.indexOf(to as any)
  if (fi === -1 || ti === -1 || ti <= fi) return [to]
  return [...BASE_ORDER.slice(fi + 1, ti + 1)]
}
```

waypoints를 재귀 setTimeout으로 순차 이동:
- 홉당 시간: `1칸=480ms, 2칸=380ms/홉, 3칸+=300ms/홉`
- CSS transition: `left {ms}ms cubic-bezier(0.4,0,0.2,1), top {ms}ms ...`

#### 다이아몬드 좌표 (컨테이너 % 기준, 230×210 비율)

| 베이스 | left | top |
|--------|------|-----|
| batter | 50%  | 95.5% |
| home   | 50%  | 88%   |
| 1루    | 87%  | 52.4% |
| 2루    | 50%  | 14.3% |
| 3루    | 13%  | 52.4% |

컨테이너 크기: `min(230px, 72vw)`, aspect-ratio `230/210`

---

## 4. 데이터 흐름 요약

```
runGame() → GameEvent[]
     ↓
useGamePlayback (nextUnitEnd 도루 중간 경계 적용)
     ↓  revealedCount 증가
deriveState(events.slice(0, revealedCount))
     ↓
liveState.lastAnimEvent + liveState.animSeq
     ↓
RunnerDiamond (useEffect on animSeq)
     ↓
CSS transition 순차 이동 애니메이션
```

---

## 5. 실행 계획

### Phase A — 데이터 모델 확장 (`derive-state.ts`)
- [ ] `RunnerAnimEvent` 타입 정의 추가
- [ ] `LiveGameState`에 `lastAnimEvent`, `animSeq` 필드 추가
- [ ] `deriveState` 내 `runner_advance`, `steal_result`, `tag_up` 이벤트 처리 추가
  - `steal_attempt`는 animEvent 등록 안 함 (steal_result에서 통합 처리)
- [ ] 빌드 확인 (타입 에러 없음)

### Phase B — 플레이백 경계 수정 (`useGamePlayback.ts`)
- [ ] `nextUnitEnd` 수정: `at_bat` 모드에서 `steal_attempt` 발견 시 `steal_result` 직후를 중간 경계로 반환
- [ ] 빌드 확인

### Phase C — RunnerDiamond 컴포넌트 구현 (`game/page.tsx`)
- [ ] `getWaypoints(from, to)` 유틸 함수 구현
- [ ] `RunnerDiamond` 컴포넌트 구현
  - SVG 베이스 경로 + 베이스 마커 렌더링
  - `dots` 내부 state 관리
  - `useEffect([animSeq])` — animSeq 변화 시 `lastAnimEvent` 처리
  - `runner_advance`: 각 move를 waypoint 순차 애니메이션
  - `steal_result`: 성공→이동, 실패→이동 완료 후 fadeOut
  - `tag_up`: safe→이동, out→즉시 fadeOut
- [ ] 빌드 확인

### Phase D — 레이아웃 재배치 (`game/page.tsx`)
- [ ] `ZoneFooter` 컴포넌트 제거
- [ ] `CountBar` (B/S 카운트만) 독립 컴포넌트로 분리
- [ ] `LiveTab` 좌측 패널 순서 재배치: ZoneStatus → ZoneVisual → RunnerDiamond → CountBar → MatchupBar → ControlBar
- [ ] 최종 빌드 + 화면 확인

---

## 6. 테스트 계획

### 기존 기능 회귀 검증
- 게임 화면 진입 → 스트라이크존/볼카운트/PBP 로그 정상 표시
- `pitch` 단위 / `at_bat` 단위 플레이백 모두 정상 진행
- Box 탭 스탯 표시 정상

### 신규 기능 검증 (시나리오별)
| 시나리오 | 확인 항목 |
|----------|-----------|
| 단타 | 타자 도트가 홈 아래에서 1루로 이동 |
| 2루타 (1루 주자 있음) | 타자 홈→1→2, 1루 주자 1→2→3 경유 이동 |
| 만루 홈런 | 모든 도트가 순서대로 홈인 후 페이드아웃 |
| 도루 성공 (`at_bat` 모드) | 도루가 중간 경계로 공개, 이동 애니메이션 표시 |
| 도루 실패 (`at_bat` 모드) | 2루까지 이동 후 페이드아웃, 아웃 카운트 +1 |
| 태그업 성공 | 3루→홈 이동 후 페이드아웃 |
| 태그업 실패 | 즉시 페이드아웃 |

---

## 7. 데이터 흐름

```
runGame() → GameEvent[]  (배치 실행, 불변)
        │
        ▼
useGamePlayback (revealedCount 관리)
  nextUnitEnd():
    pitch 모드  → +1 이벤트씩
    at_bat 모드 → at_bat_result까지, 단 steal_attempt 발견 시 steal_result+1을 먼저 반환
        │
        ▼
deriveState(events.slice(0, revealedCount))
  runner_advance → runners 갱신 + lastAnimEvent 설정 + animSeq++
  steal_result   → outs 갱신 + lastAnimEvent 설정 + animSeq++
  tag_up         → lastAnimEvent 설정 + animSeq++
  (steal_attempt → animEvent 등록 안 함, PBP 로그 전용)
        │
        ▼
liveState: { runners, lastAnimEvent, animSeq, ... }
        │
        ├─▶ RunnerDiamond({ runners, lastAnimEvent, animSeq })
        │     useEffect([animSeq]):
        │       prevSeqRef와 비교 → 신규 이벤트 감지
        │       lastAnimEvent.type에 따라 분기:
        │         runner_advance → 각 move getWaypoints() → animatePath()
        │         steal_result   → success: 이동, !success: 이동 후 fadeOut
        │         tag_up         → safe: 이동, !safe: 즉시 fadeOut
        │
        └─▶ CountBar({ count })  (B/S 카운트, 기존 로직 유지)
```

---

## 8. 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| `steal_attempt` 이후 `steal_result` 이전에 `at_bat_result`가 나오는 케이스 | nextUnitEnd fallthrough 오작동 | 루프 내 at_bat_result 우선 break로 방어 |
| `animSeq` 동일 값 재렌더 시 애니메이션 미발동 | 드물지만 가능 | animSeq는 단조증가이므로 deriveState 재호출 시 항상 변화 |
| dot 상태가 `runners` 최종 상태와 불일치 (애니메이션 중 다음 이벤트 도달) | 도트 위치 꼬임 | 이벤트 간격(SPEED_MS ≥ 500ms)이 애니메이션 시간(최대 1.5s)보다 짧을 수 있음 → `fast` 속도에서 dot 겹침 허용 (MVP 허용 범위) |
