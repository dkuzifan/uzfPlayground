import type {
  QuestTracker,
  ScenarioObjectives,
  ScenarioEndings,
  EndingCondition,
  ScenePhase,
} from "@/lib/types/game";

// ── 씬 페이즈 상수 ─────────────────────────────────────────────

export const PHASE_ORDER: ScenePhase[] = ["exploration", "tension", "climax", "resolution"];

/** QuestTracker 진척도 → 씬 페이즈 도출 (objectives 없으면 null 반환) */
export function deriveScenePhase(
  tracker: QuestTracker,
  objectives: ScenarioObjectives
): ScenePhase {
  const ratio = tracker.primary_progress / objectives.primary.progress_max;
  const doomRatio = tracker.doom_clock / tracker.doom_clock_max;

  // 진척도 기반 기본 페이즈
  let phase: ScenePhase;
  if (ratio < 0.3) phase = "exploration";
  else if (ratio < 0.65) phase = "tension";
  else if (ratio < 0.9) phase = "climax";
  else phase = "resolution";

  // Doom Clock이 50% 이상이면 최소 "tension"으로 끌어올림
  if (doomRatio >= 0.5 && PHASE_ORDER.indexOf(phase) < PHASE_ORDER.indexOf("tension")) {
    phase = "tension";
  }

  return phase;
}

/** 씬 페이즈를 앞으로만 전진 (역행 불가) */
export function advancePhase(current: ScenePhase, proposed: ScenePhase): ScenePhase {
  return PHASE_ORDER.indexOf(proposed) > PHASE_ORDER.indexOf(current) ? proposed : current;
}

// ── GM이 반환하는 목표 진척도 업데이트 구조 ──────────────────

export interface GmObjectiveUpdate {
  primary_delta?: number;       // 메인 목표 진척도 변화 (-1 ~ +2)
  secondary_delta?: number[];   // 서브 목표 변화 배열 (index별)
  secret_triggered?: boolean;   // 비밀 목표 달성
  reason?: string;              // 왜 진척됐는지 (로그용)
}

// ── 초기 QuestTracker 생성 ────────────────────────────────────

export function initQuestTracker(objectives: ScenarioObjectives): QuestTracker {
  return {
    primary_progress: 0,
    secondary_progress: (objectives.secondary ?? []).map(() => 0),
    secret_triggered: false,
    quest_clock: 0,
    doom_clock: 0,
    doom_clock_interval: objectives.doom_clock_interval,
    doom_clock_max: objectives.doom_clock_max,
    turn_count: 0,
    ended: false,
  };
}

// ── Doom Clock 틱 (매 턴 호출) ────────────────────────────────
// turn_count를 +1하고, doom_clock_interval마다 doom_clock +1

export function tickDoomClock(tracker: QuestTracker): QuestTracker {
  const newTurnCount = tracker.turn_count + 1;
  const newDoomClock =
    newTurnCount % tracker.doom_clock_interval === 0
      ? tracker.doom_clock + 1
      : tracker.doom_clock;

  return { ...tracker, turn_count: newTurnCount, doom_clock: newDoomClock };
}

// ── GM 응답으로 목표 진척도 업데이트 ─────────────────────────

export function applyObjectiveUpdate(
  tracker: QuestTracker,
  update: GmObjectiveUpdate,
  objectives: ScenarioObjectives
): QuestTracker {
  const maxPrimary = objectives.primary.progress_max;
  const newPrimary = Math.max(
    0,
    Math.min(maxPrimary, tracker.primary_progress + (update.primary_delta ?? 0))
  );

  const newSecondary = tracker.secondary_progress.map((cur, i) => {
    const delta = update.secondary_delta?.[i] ?? 0;
    const maxVal = objectives.secondary?.[i]?.progress_max ?? 6;
    return Math.max(0, Math.min(maxVal, cur + delta));
  });

  const newSecretTriggered =
    tracker.secret_triggered || (update.secret_triggered ?? false);

  return {
    ...tracker,
    primary_progress: newPrimary,
    secondary_progress: newSecondary,
    secret_triggered: newSecretTriggered,
    quest_clock: newPrimary, // quest_clock은 primary_progress의 UI alias
  };
}

// ── 엔딩 조건 평가 ────────────────────────────────────────────
// 달성된 엔딩이 있으면 EndingCondition 반환, 없으면 null

export function evaluateEndings(
  tracker: QuestTracker,
  objectives: ScenarioObjectives,
  endings: ScenarioEndings
): EndingCondition | null {
  const primaryComplete =
    tracker.primary_progress >= objectives.primary.progress_max;
  const doomMaxed = tracker.doom_clock >= tracker.doom_clock_max;

  for (const ending of endings.endings) {
    switch (ending.trigger) {
      case "primary_complete":
        if (primaryComplete) return ending;
        break;
      case "doom_maxed":
        if (doomMaxed) return ending;
        break;
      case "secret_complete":
        if (tracker.secret_triggered) return ending;
        break;
      case "primary_failed":
        // primary_failed는 doom_maxed 이후에도 primary가 미달성인 경우
        if (doomMaxed && !primaryComplete) return ending;
        break;
      case "custom":
        // custom 조건은 GM이 판단하므로 여기서 평가하지 않음
        // (GM 응답에서 ending_id를 직접 내려줄 경우에만 적용)
        break;
    }
  }

  return null;
}

// ── tracker에 엔딩 적용 ───────────────────────────────────────

export function applyEnding(
  tracker: QuestTracker,
  ending: EndingCondition
): QuestTracker {
  return { ...tracker, ended: true, ending_id: ending.id };
}
