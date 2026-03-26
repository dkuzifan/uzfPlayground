"use client";

import { useState, useEffect } from "react";
import type { ScenarioSummary } from "./ScenarioSelectStep";
import type { ObjectiveType, EndingTrigger, EndingTone, ScenarioObjectives, ScenarioEndings, JobDefinition, CharacterConfig, GameRules, ResourceRule, NpcCustomTrigger } from "@/lib/trpg/types/game";
import type { NpcDraft } from "@/app/api/trpg/scenarios/generate-npcs/route";
import type { StatSchemaEntry } from "@/lib/trpg/types/character";
import { normalizeStatSchema } from "@/lib/trpg/types/character";

export interface ScenarioInitialData {
  title: string;
  theme: string;
  description: string;
  max_players: number;
  gm_system_prompt: string;
  character_creation_config?: {
    available_jobs: string[];
    job_labels: Record<string, string>;
  };
  objectives?: ScenarioObjectives | null;
  endings?: ScenarioEndings | null;
  character_config?: CharacterConfig | null;
  game_rules?: GameRules | null;
  lore_items?: LoreItem[];
  npc_items?: NpcDraft[];
}

interface Props {
  onComplete: (scenario: ScenarioSummary) => void;
  onBack: () => void;
  initialData?: ScenarioInitialData;
  /** 수정 모드: 기존 시나리오 ID. 제공 시 PUT으로 저장 */
  scenarioId?: string;
}

type SubStep = "basic" | "jobs" | "prompt" | "objectives" | "character" | "lore" | "npcs" | "rules";

interface JobConfig {
  job: string;
  label: string;
  enabled: boolean;
}

interface LoreItem {
  domain: "WORLD_LORE" | "PERSONAL_LORE";
  category: string;
  lore_text: string;
  trigger_keywords: string[];
  cluster_tags: string[];
  importance_weight: number;
  required_access_level: number;
}

interface ObjectiveForm {
  type: ObjectiveType;
  target_description: string;
  progress_max: number;
  is_hidden?: boolean;
}

interface EndingForm {
  id: string;
  label: string;
  description: string;
  trigger: EndingTrigger;
  tone: EndingTone;
}

const THEME_OPTIONS = [
  { value: "fantasy", label: "판타지", icon: "⚔️" },
  { value: "mystery", label: "미스터리", icon: "🔍" },
  { value: "horror",  label: "호러",    icon: "👻" },
  { value: "sci-fi",  label: "SF",      icon: "🚀" },
];

const THEME_JOB_PRESETS: Record<string, JobConfig[]> = {
  fantasy: [
    { job: "warrior", label: "전사",     enabled: true },
    { job: "mage",    label: "마법사",   enabled: true },
    { job: "rogue",   label: "도적",     enabled: true },
    { job: "cleric",  label: "성직자",   enabled: true },
    { job: "ranger",  label: "레인저",   enabled: true },
    { job: "paladin", label: "성기사",   enabled: false },
    { job: "bard",    label: "음유시인", enabled: false },
  ],
  mystery: [
    { job: "detective",  label: "형사",   enabled: true },
    { job: "journalist", label: "기자",   enabled: true },
    { job: "doctor",     label: "의사",   enabled: true },
    { job: "lawyer",     label: "변호사", enabled: true },
    { job: "civilian",   label: "민간인", enabled: true },
  ],
  horror: [
    { job: "detective",  label: "형사",   enabled: true },
    { job: "doctor",     label: "의사",   enabled: true },
    { job: "journalist", label: "기자",   enabled: true },
    { job: "civilian",   label: "생존자", enabled: true },
  ],
  "sci-fi": [
    { job: "warrior", label: "전투원",   enabled: true },
    { job: "mage",    label: "과학자",   enabled: true },
    { job: "rogue",   label: "해커",     enabled: true },
    { job: "cleric",  label: "기술자",   enabled: true },
    { job: "ranger",  label: "탐사대원", enabled: true },
  ],
};

const JOB_EMOJI: Record<string, string> = {
  warrior: "⚔️", mage: "🔮", rogue: "🗡️", cleric: "✨",
  ranger: "🏹", paladin: "🛡️", bard: "🎵", adventurer: "🎒",
  detective: "🔍", journalist: "📰", doctor: "🩺", lawyer: "⚖️", civilian: "👤",
};

const PERSONALITY_THEME_MAP: Record<string, string> = {
  fantasy: "fantasy",
  mystery: "modern",
  horror:  "modern",
  "sci-fi": "modern",
};

const OBJECTIVE_TYPE_OPTIONS: { value: ObjectiveType; label: string }[] = [
  { value: "eliminate", label: "제거 — 특정 NPC/위협 처치" },
  { value: "reach",     label: "도달 — 특정 장소 도달" },
  { value: "find",      label: "발견 — 정보/물건 발견" },
  { value: "obtain",    label: "획득 — 아이템 입수" },
  { value: "protect",   label: "보호 — NPC/장소 보호" },
  { value: "survive",   label: "생존 — N턴 살아남기" },
  { value: "solve",     label: "해결 — 퍼즐/수수께끼" },
  { value: "reveal",    label: "폭로 — 숨겨진 사실 밝히기" },
  { value: "escort",    label: "호위 — NPC 안전히 동행" },
  { value: "choose",    label: "선택 — 분기점 결정" },
];

const TRIGGER_OPTIONS: { value: EndingTrigger; label: string }[] = [
  { value: "primary_complete", label: "메인 목표 달성" },
  { value: "doom_maxed",       label: "위기 시계 최대 도달" },
  { value: "secret_complete",  label: "비밀 목표 달성" },
  { value: "primary_failed",   label: "메인 목표 실패" },
  { value: "custom",           label: "GM 판단 (커스텀)" },
];

const TONE_OPTIONS: { value: EndingTone; label: string }[] = [
  { value: "triumphant",  label: "승리 (금색)" },
  { value: "bittersweet", label: "여운 (회색)" },
  { value: "tragic",      label: "비극 (빨강)" },
  { value: "mysterious",  label: "신비 (보라)" },
];

const SUB_STEP_LABELS: Record<SubStep, string> = {
  basic: "기본 정보",
  jobs: "직업 설정",
  prompt: "GM 프롬프트",
  objectives: "게임 목표",
  character: "캐릭터 설정",
  lore: "세계관 Lore",
  npcs: "NPC 설계",
  rules: "게임 룰",
};
const SUB_STEPS: SubStep[] = ["basic", "jobs", "prompt", "objectives", "character", "lore", "npcs", "rules"];

function defaultEndings(): EndingForm[] {
  return [
    { id: "full_victory", label: "완전한 승리", description: "", trigger: "primary_complete", tone: "triumphant" },
    { id: "doom_end",     label: "실패",         description: "", trigger: "doom_maxed",       tone: "tragic" },
    { id: "secret_end",   label: "비밀 엔딩",    description: "", trigger: "secret_complete",  tone: "mysterious" },
  ];
}

export default function ScenarioCreateStep({ onComplete, onBack, initialData, scenarioId }: Props) {
  const [subStep, setSubStep] = useState<SubStep>("basic");

  // Step A
  const [title, setTitle]           = useState("");
  const [theme, setTheme]           = useState("fantasy");
  const [description, setDescription] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);

  // Step B
  const [jobs, setJobs] = useState<JobConfig[]>(THEME_JOB_PRESETS.fantasy);
  const [newJobId, setNewJobId]     = useState("");
  const [newJobLabel, setNewJobLabel] = useState("");

  // Step C
  const [gmPrompt, setGmPrompt]     = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Step D
  const [primaryObj, setPrimaryObj] = useState<ObjectiveForm>({
    type: "find",
    target_description: "",
    progress_max: 4,
  });
  const [secondaryObjs, setSecondaryObjs] = useState<ObjectiveForm[]>([]);
  const [secretObj, setSecretObj] = useState<ObjectiveForm>({
    type: "reveal",
    target_description: "",
    progress_max: 4,
    is_hidden: true,
  });
  const [doomInterval, setDoomInterval] = useState(4);
  const [doomMax, setDoomMax]           = useState(8);
  const [endings, setEndings]           = useState<EndingForm[]>(defaultEndings());
  const [generatingObj, setGeneratingObj] = useState(false);
  const [objError, setObjError]           = useState<string | null>(null);

  // Step E
  const [statSchema, setStatSchema] = useState<StatSchemaEntry[]>([
    { key: "hp",      label: "체력",   icon: "❤️", display: "bar",    max_key: "hp_max", color: "green"   },
    { key: "attack",  label: "공격력", icon: "⚔️", display: "number", color: "neutral" },
    { key: "defense", label: "방어력", icon: "🛡️", display: "number", color: "neutral" },
    { key: "speed",   label: "속도",   icon: "💨", display: "number", color: "neutral" },
  ]);
  const [jobDefs, setJobDefs]           = useState<JobDefinition[]>([]);
  const [showAddStat, setShowAddStat]   = useState(false);
  const [newStatKey, setNewStatKey]     = useState("");
  const [newStatLabel, setNewStatLabel] = useState("");
  const [newStatIcon, setNewStatIcon]   = useState("📊");
  const [newStatDisplay, setNewStatDisplay] = useState<StatSchemaEntry["display"]>("number");
  const [newStatMaxKey, setNewStatMaxKey]   = useState("");
  const [generatingChar, setGeneratingChar] = useState(false);
  const [charError, setCharError]       = useState<string | null>(null);
  const [generatingJobStats, setGeneratingJobStats] = useState(false);
  const [jobStatsError, setJobStatsError] = useState<string | null>(null);

  // Step F: Lore
  const [loreItems, setLoreItems] = useState<LoreItem[]>([]);
  // Step H: NPCs
  const [npcDrafts, setNpcDrafts] = useState<NpcDraft[]>([]);
  const [generatingNpcs, setGeneratingNpcs] = useState(false);
  const [npcError, setNpcError] = useState<string | null>(null);
  const [expandedNpcIdx, setExpandedNpcIdx] = useState<number | null>(null);

  // Step G: Rules
  const [privateItems, setPrivateItems] = useState(false);
  const [privateLore, setPrivateLore]   = useState(false);
  const [resourceRules, setResourceRules] = useState<ResourceRule[]>([]);
  const [generatingRules, setGeneratingRules] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  type RulesSuggestion = {
    info_rules: { private_items: boolean; private_lore: boolean; reason: string };
    resource_rules: Array<ResourceRule & { reason: string }>;
  };
  const [rulesSuggestion, setRulesSuggestion] = useState<RulesSuggestion | null>(null);
  const [infoSuggestionDismissed, setInfoSuggestionDismissed] = useState(false);
  const [generatingLore, setGeneratingLore] = useState(false);
  const [loreError, setLoreError] = useState<string | null>(null);
  const [editingLoreIdx, setEditingLoreIdx] = useState<number | null>(null);
  type LoreGapSuggestion = {
    domain: "WORLD_LORE" | "PERSONAL_LORE";
    category: string;
    lore_text: string;
    trigger_keywords: string[];
    cluster_tags: string[];
    importance_weight: number;
    required_access_level: number;
    reason: string;
  };
  const [analyzingLore, setAnalyzingLore] = useState(false);
  const [loreAnalysisError, setLoreAnalysisError] = useState<string | null>(null);
  const [loreGapSuggestions, setLoreGapSuggestions] = useState<LoreGapSuggestion[]>([]);
  const [acceptedGapIndices, setAcceptedGapIndices] = useState<Set<number>>(new Set());

  // 저장
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // initialData로 폼 사전 채우기 (복사 기능)
  useEffect(() => {
    if (!initialData) return;

    setTitle(initialData.title ? (scenarioId ? initialData.title : `${initialData.title} (복사본)`) : "");
    setTheme(initialData.theme ?? "fantasy");
    setDescription(initialData.description ?? "");
    setMaxPlayers(initialData.max_players ?? 4);
    setGmPrompt(initialData.gm_system_prompt ?? "");

    // 직업 목록 복원
    const config = initialData.character_creation_config;
    if (config?.available_jobs?.length) {
      const restored: JobConfig[] = config.available_jobs.map((jobId) => ({
        job: jobId,
        label: config.job_labels?.[jobId] ?? jobId,
        enabled: true,
      }));
      setJobs(restored);
    }

    // 목표 복원
    const obj = initialData.objectives;
    if (obj?.primary) {
      setPrimaryObj({
        type: obj.primary.type,
        target_description: obj.primary.target_description,
        progress_max: obj.primary.progress_max,
      });
    }
    if (obj?.secondary?.length) {
      setSecondaryObjs(obj.secondary.map((s) => ({
        type: s.type,
        target_description: s.target_description,
        progress_max: s.progress_max,
      })));
    }
    if (obj?.secret) {
      setSecretObj({
        type: obj.secret.type,
        target_description: obj.secret.target_description,
        progress_max: obj.secret.progress_max,
        is_hidden: true,
      });
    }
    if (obj) {
      setDoomInterval(obj.doom_clock_interval ?? 4);
      setDoomMax(obj.doom_clock_max ?? 8);
    }

    // 엔딩 복원
    const endingData = initialData.endings;
    if (endingData?.endings?.length) {
      setEndings(endingData.endings.map((e) => ({
        id: e.id,
        label: e.label,
        description: e.description,
        trigger: e.trigger,
        tone: e.tone,
      })));
    }

    // 스탯/직업 정의 복원
    const cc = initialData.character_config;
    if (cc) {
      const schema = normalizeStatSchema(cc.stat_schema);
      if (schema.length > 0) setStatSchema(schema);
      if (cc.jobs?.length) setJobDefs(cc.jobs);
    }

    // Lore 복원
    if (initialData.lore_items?.length) {
      setLoreItems(initialData.lore_items);
    }

    // 게임 룰 복원
    if (initialData.game_rules?.info_rules) {
      setPrivateItems(initialData.game_rules.info_rules.private_items ?? false);
      setPrivateLore(initialData.game_rules.info_rules.private_lore ?? false);
    }
    if (initialData.game_rules?.resource_rules?.length) {
      setResourceRules(initialData.game_rules.resource_rules);
    }

    // NPC 복원 (수정 모드)
    if (initialData.npc_items?.length) {
      setNpcDrafts(initialData.npc_items);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);

  const enabledJobs = jobs.filter((j) => j.enabled);

  // ── Step A → B ──────────────────────────────────────────────────────
  function handleBasicNext() {
    const preset = THEME_JOB_PRESETS[theme] ?? THEME_JOB_PRESETS.fantasy;
    setJobs(preset.map((j) => ({ ...j })));
    setSubStep("jobs");
  }

  // ── Step B: 직업 토글/라벨 편집/추가 ────────────────────────────────
  function toggleJob(idx: number) {
    setJobs((prev) => prev.map((j, i) => (i === idx ? { ...j, enabled: !j.enabled } : j)));
  }
  function updateLabel(idx: number, label: string) {
    setJobs((prev) => prev.map((j, i) => (i === idx ? { ...j, label } : j)));
  }
  function addCustomJob() {
    const id = newJobId.trim().toLowerCase().replace(/\s+/g, "_");
    const label = newJobLabel.trim();
    if (!id || !label) return;
    if (jobs.some((j) => j.job === id)) return;
    setJobs((prev) => [...prev, { job: id, label, enabled: true }]);
    setNewJobId("");
    setNewJobLabel("");
  }

  // ── Step C: AI 초안 생성 ─────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const jobLabels = Object.fromEntries(enabledJobs.map((j) => [j.job, j.label]));
      const res = await fetch("/api/trpg/scenarios/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, theme, description, job_labels: jobLabels }),
      });
      const data = await res.json();
      if (!res.ok) setGenerateError(data.error ?? "생성에 실패했습니다.");
      else setGmPrompt(data.gm_system_prompt);
    } catch {
      setGenerateError("네트워크 오류가 발생했습니다.");
    } finally {
      setGenerating(false);
    }
  }

  // ── Step D: 목표 자동 생성 ───────────────────────────────────────────
  async function handleGenerateObjectives() {
    setGeneratingObj(true);
    setObjError(null);
    try {
      const res = await fetch("/api/trpg/scenarios/generate-objectives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, theme, description, gm_system_prompt: gmPrompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setObjError(data.error ?? "자동 생성에 실패했습니다.");
        return;
      }
      const obj = data.objectives as ScenarioObjectives;
      const end = data.endings as ScenarioEndings;
      setPrimaryObj({
        type: obj.primary.type,
        target_description: obj.primary.target_description,
        progress_max: obj.primary.progress_max,
      });
      setSecondaryObjs((obj.secondary ?? []).map((s) => ({
        type: s.type,
        target_description: s.target_description,
        progress_max: s.progress_max,
      })));
      if (obj.secret) {
        setSecretObj({
          type: obj.secret.type,
          target_description: obj.secret.target_description,
          progress_max: obj.secret.progress_max,
          is_hidden: true,
        });
      }
      setDoomInterval(obj.doom_clock_interval);
      setDoomMax(obj.doom_clock_max);
      setEndings(end.endings.map((e) => ({
        id: e.id,
        label: e.label,
        description: e.description,
        trigger: e.trigger,
        tone: e.tone,
      })));
    } catch {
      setObjError("네트워크 오류가 발생했습니다.");
    } finally {
      setGeneratingObj(false);
    }
  }

  // ── Step D: 서브 목표 추가/삭제 ──────────────────────────────────────
  function addSecondary() {
    if (secondaryObjs.length >= 2) return;
    setSecondaryObjs((prev) => [...prev, { type: "find", target_description: "", progress_max: 4 }]);
  }
  function removeSecondary(idx: number) {
    setSecondaryObjs((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateSecondary(idx: number, patch: Partial<ObjectiveForm>) {
    setSecondaryObjs((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  }

  // ── Step D: 엔딩 편집 ────────────────────────────────────────────────
  function updateEnding(idx: number, patch: Partial<EndingForm>) {
    setEndings((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }

  // ── Step E: AI 캐릭터 설정 생성 ─────────────────────────────────────
  async function handleGenerateCharacterConfig() {
    setGeneratingChar(true);
    setCharError(null);
    try {
      const jobLabels = Object.fromEntries(enabledJobs.map((j) => [j.job, j.label]));
      const res = await fetch("/api/trpg/scenarios/generate-character-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, theme, description, gm_system_prompt: gmPrompt, job_labels: jobLabels }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCharError(data.error ?? "생성에 실패했습니다.");
        return;
      }
      const config = data.character_config as CharacterConfig;
      setStatSchema(config.stat_schema as StatSchemaEntry[]);
      setJobDefs(config.jobs);
    } catch {
      setCharError("네트워크 오류가 발생했습니다.");
    } finally {
      setGeneratingChar(false);
    }
  }

  // ── Step E: 직업 스탯 편집 ─────────────────────────────────────────
  function updateJobStat(jobIdx: number, stat: string, value: number) {
    setJobDefs((prev) =>
      prev.map((j, i) =>
        i === jobIdx ? { ...j, base_stats: { ...j.base_stats, [stat]: value } } : j
      )
    );
  }

  // ── Step E: AI 직업별 스탯 생성 ─────────────────────────────────────
  async function handleGenerateJobStats() {
    setGeneratingJobStats(true);
    setJobStatsError(null);
    try {
      const res = await fetch("/api/trpg/scenarios/generate-job-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stat_schema: statSchema,
          jobs: jobDefs.map((j) => ({ id: j.id, name: j.name, description: j.description })),
          theme,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJobStatsError(data.error ?? "생성에 실패했습니다.");
        return;
      }
      const result = data as { jobs: Array<{ id: string; base_stats: Record<string, number> }> };
      setJobDefs((prev) =>
        prev.map((j) => {
          const found = result.jobs.find((r) => r.id === j.id);
          return found ? { ...j, base_stats: found.base_stats } : j;
        })
      );
    } catch {
      setJobStatsError("네트워크 오류가 발생했습니다.");
    } finally {
      setGeneratingJobStats(false);
    }
  }

  // ── Step D→E 전환 시 jobDefs 초기화 ─────────────────────────────────
  function handleObjectivesNext() {
    if (jobDefs.length === 0) {
      // StatSchemaEntry 기반 기본 스탯 계산
      const defaultStats: Record<string, number> = {};
      statSchema.forEach((s) => {
        defaultStats[s.key] = s.display === "bar" ? 100 : 10;
      });
      // bar 타입의 max_key 값도 자동 추가
      statSchema.filter((s) => s.display === "bar" && s.max_key).forEach((s) => {
        defaultStats[s.max_key!] = defaultStats[s.key] ?? 100;
      });
      setJobDefs(
        enabledJobs.map((j) => ({
          id: j.job,
          name: j.label,
          description: "",
          base_stats: { ...defaultStats },
        }))
      );
    }
    setSubStep("character");
  }

  // ── Step F: Lore AI 자동 생성 ────────────────────────────────────────
  async function handleGenerateLore() {
    setGeneratingLore(true);
    setLoreError(null);
    try {
      const res = await fetch("/api/trpg/scenarios/generate-lore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          theme,
          description,
          gm_system_prompt: gmPrompt,
          primary_objective: primaryObj.target_description,
          secret_objective: secretObj.target_description,
          ending_descriptions: endings.filter((e) => e.description.trim()).map((e) => e.description),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoreError(data.error ?? "생성에 실패했습니다.");
        return;
      }
      setLoreItems(data.lore_items as LoreItem[]);
    } catch {
      setLoreError("네트워크 오류가 발생했습니다.");
    } finally {
      setGeneratingLore(false);
    }
  }

  // ── Step F: Lore 보완 분석 ───────────────────────────────────────────
  async function handleAnalyzeLoreGaps() {
    setAnalyzingLore(true);
    setLoreAnalysisError(null);
    setLoreGapSuggestions([]);
    setAcceptedGapIndices(new Set());
    try {
      const res = await fetch("/api/trpg/scenarios/analyze-lore-gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          theme,
          description,
          gm_system_prompt: gmPrompt,
          primary_objective: primaryObj.target_description,
          secret_objective: secretObj.target_description,
          endings: endings.filter((e) => e.label.trim()).map((e) => `${e.label}: ${e.description || "(설명 없음)"}`),
          npc_names: npcDrafts.filter((n) => n.name.trim()).map((n) => n.name),
          existing_lore: loreItems.map((l) => ({
            category: l.category,
            lore_text: l.lore_text,
            trigger_keywords: l.trigger_keywords,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoreAnalysisError(data.error ?? "분석에 실패했습니다.");
        return;
      }
      setLoreGapSuggestions(data.suggestions ?? []);
    } catch {
      setLoreAnalysisError("네트워크 오류가 발생했습니다.");
    } finally {
      setAnalyzingLore(false);
    }
  }

  function acceptLoreGapSuggestion(idx: number) {
    const s = loreGapSuggestions[idx];
    if (!s) return;
    setLoreItems((prev) => [...prev, {
      domain: s.domain,
      category: s.category,
      lore_text: s.lore_text,
      trigger_keywords: s.trigger_keywords,
      cluster_tags: s.cluster_tags,
      importance_weight: s.importance_weight,
      required_access_level: s.required_access_level,
    }]);
    setAcceptedGapIndices((prev) => new Set([...prev, idx]));
  }

  function dismissLoreGapSuggestion(idx: number) {
    setLoreGapSuggestions((prev) => prev.filter((_, i) => i !== idx));
    setAcceptedGapIndices((prev) => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
  }

  function updateLoreItem(idx: number, patch: Partial<LoreItem>) {
    setLoreItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  }

  function removeLoreItem(idx: number) {
    setLoreItems((prev) => prev.filter((_, i) => i !== idx));
    if (editingLoreIdx === idx) setEditingLoreIdx(null);
  }

  function addEmptyLoreItem() {
    setLoreItems((prev) => [
      ...prev,
      {
        domain: "WORLD_LORE",
        category: "기타",
        lore_text: "",
        trigger_keywords: [],
        cluster_tags: [],
        importance_weight: 5,
        required_access_level: 1,
      },
    ]);
    setEditingLoreIdx(loreItems.length);
  }

  // ── Step H: NPC 생성 ────────────────────────────────────────────────
  async function handleGenerateNpcs() {
    setGeneratingNpcs(true);
    setNpcError(null);
    try {
      const res = await fetch("/api/trpg/scenarios/generate-npcs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          theme,
          description,
          gm_system_prompt: gmPrompt,
          primary_objective: primaryObj.target_description,
          secret_objective: secretObj.target_description,
          endings: endings.filter((e) => e.label.trim()).map((e) => `${e.label}: ${e.description || "(설명 없음)"}`),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNpcError(data.error ?? "생성에 실패했습니다.");
        return;
      }
      setNpcDrafts(data.npcs as NpcDraft[]);
      setExpandedNpcIdx(null);
    } catch {
      setNpcError("네트워크 오류가 발생했습니다.");
    } finally {
      setGeneratingNpcs(false);
    }
  }

  function updateNpcDraft(idx: number, patch: Partial<NpcDraft>) {
    setNpcDrafts((prev) => prev.map((n, i) => i === idx ? { ...n, ...patch } : n));
  }

  function removeNpcDraft(idx: number) {
    setNpcDrafts((prev) => prev.filter((_, i) => i !== idx));
    if (expandedNpcIdx === idx) setExpandedNpcIdx(null);
  }

  function addCustomTrigger(npcIdx: number) {
    const npc = npcDrafts[npcIdx];
    const existing = npc.custom_triggers ?? [];
    const newTrigger: NpcCustomTrigger = {
      id: `ct_${Date.now()}`,
      condition_field: "affinity",
      condition_op: ">=",
      condition_value: 70,
      action_hint: "",
      once: true,
    };
    updateNpcDraft(npcIdx, { custom_triggers: [...existing, newTrigger] });
  }

  function updateCustomTrigger(npcIdx: number, ctIdx: number, patch: Partial<NpcCustomTrigger>) {
    const npc = npcDrafts[npcIdx];
    const existing = npc.custom_triggers ?? [];
    const updated = existing.map((ct, i) => i === ctIdx ? { ...ct, ...patch } : ct);
    updateNpcDraft(npcIdx, { custom_triggers: updated });
  }

  function removeCustomTrigger(npcIdx: number, ctIdx: number) {
    const npc = npcDrafts[npcIdx];
    const updated = (npc.custom_triggers ?? []).filter((_, i) => i !== ctIdx);
    updateNpcDraft(npcIdx, { custom_triggers: updated });
  }

  function addEmptyNpc() {
    setNpcDrafts((prev) => [...prev, {
      name: "",
      role: "neutral",
      appearance: "",
      personality: "",
      mbti: "ENFJ",
      enneagram: 2,
      dnd_alignment: "true-neutral",
      hidden_motivation: { goal: "", secret: "" },
      system_prompt: "",
      linguistic_profile: {
        speech_style: "평범한 구어체",
        sentence_ending: "",
        honorific_rules: "상황에 따라",
        vocal_tics: "",
        evasion_style: "바빠 보이는 척하며 화제를 돌림",
        forbidden_words: [],
      },
      resistance_stats: { physical_defense: 10, mental_willpower: 10, perception: 10 },
      knowledge_level: 3,
    }]);
    setExpandedNpcIdx(npcDrafts.length);
  }

  // ── Step G: AI 룰 제안 ──────────────────────────────────────────────
  async function handleGenerateRules() {
    setGeneratingRules(true);
    setRulesError(null);
    setRulesSuggestion(null);
    setInfoSuggestionDismissed(false);
    try {
      const res = await fetch("/api/trpg/scenarios/generate-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          theme,
          description,
          gm_system_prompt: gmPrompt,
          primary_objective: primaryObj.target_description,
          stat_schema: statSchema.map((s) => ({ key: s.key, label: s.label, icon: s.icon })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRulesError(data.error ?? "생성에 실패했습니다.");
        return;
      }
      setRulesSuggestion(data.rules);
    } catch {
      setRulesError("네트워크 오류가 발생했습니다.");
    } finally {
      setGeneratingRules(false);
    }
  }

  function acceptInfoRuleSuggestion() {
    if (!rulesSuggestion) return;
    setPrivateItems(rulesSuggestion.info_rules.private_items);
    setPrivateLore(rulesSuggestion.info_rules.private_lore);
    setInfoSuggestionDismissed(true);
  }

  function acceptResourceRuleSuggestion(idx: number) {
    if (!rulesSuggestion) return;
    const suggested = rulesSuggestion.resource_rules[idx];
    // 이미 같은 stat_key가 있으면 교체, 없으면 추가
    setResourceRules((prev) => {
      const exists = prev.findIndex((r) => r.stat_key === suggested.stat_key);
      const { reason: _r, ...rule } = suggested;
      if (exists >= 0) return prev.map((r, i) => i === exists ? rule : r);
      return [...prev, rule];
    });
    setRulesSuggestion((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        resource_rules: prev.resource_rules.filter((_, i) => i !== idx),
      };
    });
  }

  // ── 최종 저장 ────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSaveError(null);

    const jobLabels = Object.fromEntries(enabledJobs.map((j) => [j.job, j.label]));

    const objectives: ScenarioObjectives | null = primaryObj.target_description.trim()
      ? {
          primary: {
            type: primaryObj.type,
            target_description: primaryObj.target_description.trim(),
            progress_max: primaryObj.progress_max,
          },
          secondary: secondaryObjs
            .filter((o) => o.target_description.trim())
            .map((o) => ({ type: o.type, target_description: o.target_description.trim(), progress_max: o.progress_max })),
          secret: secretObj.target_description.trim()
            ? { type: secretObj.type, target_description: secretObj.target_description.trim(), progress_max: secretObj.progress_max, is_hidden: true }
            : undefined,
          doom_clock_interval: doomInterval,
          doom_clock_max: doomMax,
        }
      : null;

    const endingsData: ScenarioEndings | null = endings.some((e) => e.label.trim())
      ? { endings: endings.filter((e) => e.label.trim()).map((e) => ({ ...e, label: e.label.trim(), description: e.description.trim(), custom_condition: undefined })) }
      : null;

    const payload = {
      title,
      theme,
      description,
      max_players: maxPlayers,
      gm_system_prompt: gmPrompt,
      character_creation_config: {
        available_jobs: enabledJobs.map((j) => j.job),
        job_labels: jobLabels,
        personality_test_theme: PERSONALITY_THEME_MAP[theme] ?? "fantasy",
        character_name_hint: theme === "fantasy" ? "모험가의 이름을 입력하세요" : "캐릭터 이름을 입력하세요",
      },
      objectives,
      endings: endingsData,
      character_config: jobDefs.length > 0
        ? { stat_schema: statSchema, jobs: jobDefs }
        : null,
      lore_items: loreItems.filter((l) => l.lore_text.trim()),
      game_rules: {
        info_rules: { private_items: privateItems, private_lore: privateLore },
        resource_rules: resourceRules.length > 0 ? resourceRules : undefined,
      },
    };

    const validNpcs = npcDrafts.filter((n) => n.name.trim() && n.system_prompt.trim());

    try {
      const isEdit = !!scenarioId;
      const res = await fetch(
        isEdit ? `/api/trpg/scenarios/${scenarioId}` : "/api/trpg/scenarios",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isEdit ? { ...payload, npcs: validNpcs } : payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "저장에 실패했습니다.");
        return;
      }

      // 신규 생성 시에만 별도 NPC bulk-create 호출
      if (!isEdit && validNpcs.length > 0) {
        try {
          await fetch("/api/trpg/npc/bulk-create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scenario_id: data.id, npcs: validNpcs }),
          });
        } catch {
          console.error("[handleSave] NPC 저장 실패 (시나리오는 저장됨)");
        }
      }

      onComplete(data);
    } catch {
      setSaveError("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  // ── 렌더 ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* 진행 표시 */}
      <div className="flex items-center gap-1.5 text-xs text-neutral-400 flex-wrap">
        {SUB_STEPS.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                subStep === s
                  ? "bg-yellow-400 text-neutral-900"
                  : i < SUB_STEPS.indexOf(subStep)
                  ? "bg-neutral-300 text-neutral-600 dark:bg-neutral-600 dark:text-neutral-300"
                  : "border border-neutral-300 dark:border-neutral-600"
              }`}
            >
              {i + 1}
            </span>
            <span className={subStep === s ? "text-neutral-700 dark:text-neutral-200" : ""}>
              {SUB_STEP_LABELS[s]}
            </span>
            {i < SUB_STEPS.length - 1 && <span>›</span>}
          </span>
        ))}
      </div>

      {/* ── Step A: 기본 정보 ── */}
      {subStep === "basic" && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              시나리오 제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text" maxLength={40}
              placeholder="예: 어둠의 던전, 저택 살인사건"
              value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-black/15 bg-white/70 px-3 py-2 text-sm outline-none focus:border-yellow-500/60 dark:border-white/20 dark:bg-white/5 dark:text-white"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              테마 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {THEME_OPTIONS.map((t) => (
                <button
                  key={t.value} onClick={() => setTheme(t.value)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                    theme === t.value
                      ? "border-yellow-400 bg-yellow-50 font-semibold text-yellow-700 dark:border-yellow-500 dark:bg-yellow-900/20 dark:text-yellow-300"
                      : "border-black/10 bg-white hover:border-yellow-300 dark:border-white/10 dark:bg-white/5"
                  }`}
                >
                  <span>{t.icon}</span><span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              시나리오 설명
            </label>
            <textarea
              rows={3} maxLength={300}
              placeholder="플레이어에게 보여줄 간단한 소개 (선택)"
              value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full resize-none rounded-lg border border-black/15 bg-white/70 px-3 py-2 text-sm outline-none focus:border-yellow-500/60 dark:border-white/20 dark:bg-white/5 dark:text-white"
            />
            <p className="mt-0.5 text-right text-xs text-neutral-400">{description.length}/300</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              최대 인원{" "}
              <span className="font-bold text-yellow-600 dark:text-yellow-400">{maxPlayers}명</span>
            </label>
            <input
              type="range" min={2} max={7} value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="w-full accent-yellow-500"
            />
            <div className="flex justify-between text-xs text-neutral-400"><span>2명</span><span>7명</span></div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onBack}
              className="flex-1 rounded-lg border border-black/10 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              취소
            </button>
            <button
              onClick={handleBasicNext} disabled={!title.trim()}
              className="flex-1 rounded-lg bg-yellow-400 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-yellow-500 disabled:opacity-40"
            >
              다음 →
            </button>
          </div>
        </div>
      )}

      {/* ── Step B: 직업 설정 ── */}
      {subStep === "jobs" && (
        <div className="space-y-4">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            플레이어가 선택할 수 있는 직업을 설정하세요.
          </p>
          <div className="space-y-2">
            {jobs.map((j, idx) => (
              <div
                key={j.job}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
                  j.enabled
                    ? "border-yellow-400/50 bg-yellow-50/60 dark:border-yellow-500/30 dark:bg-yellow-900/10"
                    : "border-black/10 bg-white opacity-50 dark:border-white/10 dark:bg-white/5"
                }`}
              >
                <button
                  onClick={() => toggleJob(idx)}
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border text-xs font-bold transition ${
                    j.enabled ? "border-yellow-400 bg-yellow-400 text-neutral-900" : "border-neutral-300 dark:border-neutral-600"
                  }`}
                >
                  {j.enabled && "✓"}
                </button>
                <span className="text-base">{JOB_EMOJI[j.job] ?? "👤"}</span>
                <input
                  type="text" value={j.label} onChange={(e) => updateLabel(idx, e.target.value)}
                  disabled={!j.enabled} maxLength={12}
                  className="flex-1 bg-transparent text-sm font-medium outline-none dark:text-white"
                />
                <span className="text-xs text-neutral-400 dark:text-neutral-500">{j.job}</span>
              </div>
            ))}
          </div>

          {/* 직업 추가 */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="직업 ID (영문)"
              value={newJobId}
              onChange={(e) => setNewJobId(e.target.value)}
              maxLength={20}
              className="w-28 rounded-lg border border-black/10 bg-white/80 px-2.5 py-1.5 text-xs outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
            <input
              type="text"
              placeholder="표시 이름"
              value={newJobLabel}
              onChange={(e) => setNewJobLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addCustomJob(); }}
              maxLength={12}
              className="flex-1 rounded-lg border border-black/10 bg-white/80 px-2.5 py-1.5 text-xs outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
            <button
              onClick={addCustomJob}
              disabled={!newJobId.trim() || !newJobLabel.trim()}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              + 추가
            </button>
          </div>

          {enabledJobs.length === 0 && (
            <p className="text-xs text-red-400">최소 1개 이상의 직업을 선택해주세요.</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setSubStep("basic")}
              className="flex-1 rounded-lg border border-black/10 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              ← 이전
            </button>
            <button
              onClick={() => setSubStep("prompt")} disabled={enabledJobs.length === 0}
              className="flex-1 rounded-lg bg-yellow-400 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-yellow-500 disabled:opacity-40"
            >
              다음 →
            </button>
          </div>
        </div>
      )}

      {/* ── Step C: GM 프롬프트 ── */}
      {subStep === "prompt" && (
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                GM 시스템 프롬프트 <span className="text-red-500">*</span>
              </label>
              <button
                onClick={handleGenerate} disabled={generating}
                className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
              >
                {generating ? (
                  <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white dark:border-neutral-900/30 dark:border-t-neutral-900" />생성 중…</>
                ) : <>✨ AI로 초안 생성</>}
              </button>
            </div>
            {generateError && <p className="mb-1.5 text-xs text-red-400">{generateError}</p>}
            <textarea
              rows={10}
              placeholder={`AI 초안 생성 버튼을 누르거나 직접 작성하세요.\n\n예시:\n당신은 어둠의 던전을 배경으로 한 판타지 RPG의 게임 마스터입니다.\n\n[세계관]\n...\n\n[GM 규칙]\n...`}
              value={gmPrompt} onChange={(e) => setGmPrompt(e.target.value)}
              className="w-full resize-none rounded-lg border border-black/15 bg-white/70 px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-yellow-500/60 dark:border-white/20 dark:bg-white/5 dark:text-white"
            />
            <p className="mt-0.5 text-right text-xs text-neutral-400">{gmPrompt.length}자</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setSubStep("jobs")}
              className="flex-1 rounded-lg border border-black/10 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              ← 이전
            </button>
            <button
              onClick={() => setSubStep("objectives")} disabled={!gmPrompt.trim()}
              className="flex-1 rounded-lg bg-yellow-400 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-yellow-500 disabled:opacity-40"
            >
              다음 →
            </button>
          </div>
        </div>
      )}

      {/* ── Step D: 게임 목표 설정 ── */}
      {subStep === "objectives" && (
        <div className="space-y-5">
          {/* 자동 생성 버튼 */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              목표와 엔딩을 설정하세요. 건너뛰면 목표 없이 진행됩니다.
            </p>
            <button
              onClick={handleGenerateObjectives} disabled={generatingObj}
              className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 whitespace-nowrap"
            >
              {generatingObj ? (
                <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white dark:border-neutral-900/30 dark:border-t-neutral-900" />생성 중…</>
              ) : <>✨ AI 자동 생성</>}
            </button>
          </div>
          {objError && <p className="text-xs text-red-400">{objError}</p>}

          {/* 메인 목표 */}
          <section className="space-y-2 rounded-xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5">
            <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">메인 목표</h4>
            <div className="flex gap-2">
              <select
                value={primaryObj.type}
                onChange={(e) => setPrimaryObj((p) => ({ ...p, type: e.target.value as ObjectiveType }))}
                className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-neutral-800 dark:text-white"
              >
                {OBJECTIVE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <span className="flex items-center text-xs text-neutral-400">클락</span>
              <select
                value={primaryObj.progress_max}
                onChange={(e) => setPrimaryObj((p) => ({ ...p, progress_max: Number(e.target.value) }))}
                className="w-16 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-neutral-800 dark:text-white"
              >
                {[4, 6, 8].map((v) => <option key={v} value={v}>{v}칸</option>)}
              </select>
            </div>
            <input
              type="text" maxLength={60}
              placeholder="예: 카림을 마을 밖으로 데려간다"
              value={primaryObj.target_description}
              onChange={(e) => setPrimaryObj((p) => ({ ...p, target_description: e.target.value }))}
              className="w-full rounded-lg border border-black/10 bg-white/80 px-3 py-1.5 text-sm outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
          </section>

          {/* 서브 목표 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                서브 목표 <span className="font-normal text-neutral-400">({secondaryObjs.length}/2)</span>
              </h4>
              {secondaryObjs.length < 2 && (
                <button
                  onClick={addSecondary}
                  className="rounded-lg border border-black/10 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
                >
                  + 추가
                </button>
              )}
            </div>
            {secondaryObjs.map((obj, i) => (
              <div key={i} className="space-y-1.5 rounded-xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center gap-2">
                  <select
                    value={obj.type}
                    onChange={(e) => updateSecondary(i, { type: e.target.value as ObjectiveType })}
                    className="flex-1 rounded-lg border border-black/10 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-neutral-800 dark:text-white"
                  >
                    {OBJECTIVE_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <select
                    value={obj.progress_max}
                    onChange={(e) => updateSecondary(i, { progress_max: Number(e.target.value) })}
                    className="w-16 rounded-lg border border-black/10 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-neutral-800 dark:text-white"
                  >
                    {[4, 6, 8].map((v) => <option key={v} value={v}>{v}칸</option>)}
                  </select>
                  <button onClick={() => removeSecondary(i)} className="text-xs text-red-400 hover:text-red-600">✕</button>
                </div>
                <input
                  type="text" maxLength={60}
                  placeholder="서브 목표 설명"
                  value={obj.target_description}
                  onChange={(e) => updateSecondary(i, { target_description: e.target.value })}
                  className="w-full rounded-lg border border-black/10 bg-white/80 px-3 py-1.5 text-sm outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </div>
            ))}
            {secondaryObjs.length === 0 && (
              <p className="text-xs text-neutral-400">서브 목표 없음 (선택 사항)</p>
            )}
          </section>

          {/* 비밀 목표 */}
          <section className="space-y-2 rounded-xl border border-dashed border-black/10 bg-white/40 p-3 dark:border-white/10 dark:bg-white/5">
            <h4 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              비밀 목표 <span className="font-normal">(플레이어에게 숨겨짐)</span>
            </h4>
            <div className="flex gap-2">
              <select
                value={secretObj.type}
                onChange={(e) => setSecretObj((s) => ({ ...s, type: e.target.value as ObjectiveType }))}
                className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-neutral-800 dark:text-white"
              >
                {OBJECTIVE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                value={secretObj.progress_max}
                onChange={(e) => setSecretObj((s) => ({ ...s, progress_max: Number(e.target.value) }))}
                className="w-16 rounded-lg border border-black/10 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-neutral-800 dark:text-white"
              >
                {[4, 6].map((v) => <option key={v} value={v}>{v}칸</option>)}
              </select>
            </div>
            <input
              type="text" maxLength={60}
              placeholder="예: 배신자의 정체를 밝혀낸다 (선택 사항)"
              value={secretObj.target_description}
              onChange={(e) => setSecretObj((s) => ({ ...s, target_description: e.target.value }))}
              className="w-full rounded-lg border border-black/10 bg-white/80 px-3 py-1.5 text-sm outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
          </section>

          {/* Doom Clock */}
          <section className="space-y-3 rounded-xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5">
            <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">위기 시계 (Doom Clock)</h4>
            <div>
              <label className="text-xs text-neutral-500">
                {doomInterval}턴마다 +1 증가
              </label>
              <input
                type="range" min={2} max={6} value={doomInterval}
                onChange={(e) => setDoomInterval(Number(e.target.value))}
                className="w-full accent-red-500"
              />
              <div className="flex justify-between text-xs text-neutral-400"><span>2턴</span><span>6턴</span></div>
            </div>
            <div>
              <label className="text-xs text-neutral-500">
                최대 <span className="font-bold text-red-500">{doomMax}</span>칸 (초과 시 실패 엔딩)
              </label>
              <input
                type="range" min={4} max={12} value={doomMax}
                onChange={(e) => setDoomMax(Number(e.target.value))}
                className="w-full accent-red-500"
              />
              <div className="flex justify-between text-xs text-neutral-400"><span>4칸</span><span>12칸</span></div>
            </div>
          </section>

          {/* 엔딩 설정 */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
              엔딩 결말 <span className="font-normal text-neutral-400">({endings.length}개)</span>
            </h4>
            {endings.map((ending, i) => (
              <div key={ending.id} className="space-y-1.5 rounded-xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5">
                <div className="flex gap-2">
                  <input
                    type="text" maxLength={20}
                    placeholder="엔딩 레이블"
                    value={ending.label}
                    onChange={(e) => updateEnding(i, { label: e.target.value })}
                    className="flex-1 rounded-lg border border-black/10 bg-white/80 px-2 py-1 text-xs outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                  <select
                    value={ending.trigger}
                    onChange={(e) => updateEnding(i, { trigger: e.target.value as EndingTrigger })}
                    className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-neutral-800 dark:text-white"
                  >
                    {TRIGGER_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <select
                    value={ending.tone}
                    onChange={(e) => updateEnding(i, { tone: e.target.value as EndingTone })}
                    className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-neutral-800 dark:text-white"
                  >
                    {TONE_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <textarea
                  rows={2} maxLength={200}
                  placeholder="결말 설명 (게임 종료 시 플레이어에게 표시됩니다)"
                  value={ending.description}
                  onChange={(e) => updateEnding(i, { description: e.target.value })}
                  className="w-full resize-none rounded-lg border border-black/10 bg-white/80 px-3 py-1.5 text-xs outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </div>
            ))}
          </section>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setSubStep("prompt")}
              className="flex-1 rounded-lg border border-black/10 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              ← 이전
            </button>
            <button
              onClick={handleObjectivesNext}
              className="flex-1 rounded-lg bg-yellow-400 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-yellow-500"
            >
              다음 →
            </button>
          </div>
        </div>
      )}
      {/* ── Step E: 캐릭터 설정 ── */}
      {subStep === "character" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              스탯 종류와 직업별 기본 수치를 설정하세요.
            </p>
            <button
              onClick={handleGenerateCharacterConfig} disabled={generatingChar}
              className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 whitespace-nowrap"
            >
              {generatingChar ? (
                <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white dark:border-neutral-900/30 dark:border-t-neutral-900" />생성 중…</>
              ) : <>✨ AI 자동 제안</>}
            </button>
          </div>
          {charError && <p className="text-xs text-red-400">{charError}</p>}

          {/* 스탯 종류 편집 */}
          <section className="space-y-2 rounded-xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5">
            <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">스탯 종류</h4>
            <div className="space-y-1.5">
              {statSchema.map((stat, i) => (
                <div key={stat.key} className="flex items-center gap-2 rounded-lg border border-black/5 bg-white/80 px-2.5 py-1.5 text-xs dark:border-white/5 dark:bg-white/5">
                  <span className="w-5 text-center">{stat.icon}</span>
                  <span className="w-16 font-medium text-neutral-700 dark:text-neutral-300 truncate">{stat.label}</span>
                  <span className="text-neutral-400">({stat.key})</span>
                  <select
                    value={stat.display}
                    onChange={(e) => {
                      const display = e.target.value as StatSchemaEntry["display"];
                      setStatSchema((prev) => prev.map((s, idx) => idx === i ? { ...s, display, max_key: display === "number" ? undefined : s.max_key } : s));
                    }}
                    className="rounded border border-black/10 bg-white px-1.5 py-0.5 text-xs dark:border-white/10 dark:bg-neutral-800 dark:text-white"
                  >
                    <option value="bar">바 (게이지)</option>
                    <option value="counter">카운터 (X/Y)</option>
                    <option value="number">숫자</option>
                  </select>
                  {(stat.display === "bar" || stat.display === "counter") && (
                    <input
                      type="text"
                      value={stat.max_key ?? ""}
                      onChange={(e) => setStatSchema((prev) => prev.map((s, idx) => idx === i ? { ...s, max_key: e.target.value || undefined } : s))}
                      placeholder="최대값 키 (예: hp_max)"
                      maxLength={20}
                      className="w-24 rounded border border-black/10 bg-white/80 px-1.5 py-0.5 text-xs outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                  )}
                  {statSchema.length > 1 && (
                    <button
                      onClick={() => {
                        const removed = stat.key;
                        setStatSchema((prev) => prev.filter((_, idx) => idx !== i));
                        setJobDefs((prev) => prev.map((j) => {
                          const { [removed]: _r, ...rest } = j.base_stats;
                          return { ...j, base_stats: rest };
                        }));
                      }}
                      className="ml-auto text-neutral-400 hover:text-red-500"
                    >✕</button>
                  )}
                </div>
              ))}
            </div>

            {/* 스탯 추가 폼 */}
            {showAddStat ? (
              <div className="space-y-1.5 rounded-lg border border-dashed border-yellow-300 bg-yellow-50/50 p-2 dark:border-yellow-600/40 dark:bg-yellow-900/10">
                <div className="flex gap-1.5">
                  <input type="text" value={newStatIcon} onChange={(e) => setNewStatIcon(e.target.value)} placeholder="아이콘" maxLength={4} className="w-10 rounded border border-black/10 bg-white px-1.5 py-1 text-center text-xs outline-none dark:border-white/10 dark:bg-neutral-800 dark:text-white" />
                  <input type="text" value={newStatLabel} onChange={(e) => setNewStatLabel(e.target.value)} placeholder="레이블 (예: 수사력)" maxLength={10} className="flex-1 rounded border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-neutral-800 dark:text-white" />
                  <input type="text" value={newStatKey} onChange={(e) => setNewStatKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="키 (예: investigation)" maxLength={20} className="flex-1 rounded border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-neutral-800 dark:text-white" />
                </div>
                <div className="flex gap-1.5 items-center">
                  <select value={newStatDisplay} onChange={(e) => setNewStatDisplay(e.target.value as StatSchemaEntry["display"])} className="rounded border border-black/10 bg-white px-1.5 py-1 text-xs dark:border-white/10 dark:bg-neutral-800 dark:text-white">
                    <option value="bar">바 (게이지)</option>
                    <option value="counter">카운터 (X/Y)</option>
                    <option value="number">숫자</option>
                  </select>
                  {(newStatDisplay === "bar" || newStatDisplay === "counter") && (
                    <input type="text" value={newStatMaxKey} onChange={(e) => setNewStatMaxKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder={`최대값 키 (예: ${newStatKey || "stat"}_max)`} maxLength={20} className="flex-1 rounded border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-neutral-800 dark:text-white" />
                  )}
                  <button
                    onClick={() => {
                      const key = newStatKey.trim();
                      const label = newStatLabel.trim();
                      if (!key || !label || statSchema.find(s => s.key === key)) return;
                      const entry: StatSchemaEntry = { key, label, icon: newStatIcon || "📊", display: newStatDisplay, max_key: (newStatDisplay !== "number" && newStatMaxKey.trim()) ? newStatMaxKey.trim() : undefined, color: "neutral" };
                      setStatSchema((prev) => [...prev, entry]);
                      const defaultVal = newStatDisplay === "bar" ? 100 : 10;
                      const newBase: Record<string, number> = { [key]: defaultVal };
                      if (entry.max_key) newBase[entry.max_key] = defaultVal;
                      setJobDefs((prev) => prev.map((j) => ({ ...j, base_stats: { ...j.base_stats, ...newBase } })));
                      setNewStatKey(""); setNewStatLabel(""); setNewStatIcon("📊"); setNewStatDisplay("number"); setNewStatMaxKey(""); setShowAddStat(false);
                    }}
                    className="rounded-lg bg-yellow-400 px-3 py-1 text-xs font-semibold text-neutral-900 hover:bg-yellow-500"
                  >추가</button>
                  <button onClick={() => setShowAddStat(false)} className="text-xs text-neutral-400 hover:text-neutral-600">취소</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddStat(true)} className="rounded-lg border border-black/10 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5">
                + 스탯 추가
              </button>
            )}
          </section>

          {/* 직업별 기본 스탯 */}
          {jobDefs.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">직업별 기본 스탯</h4>
                <button
                  onClick={handleGenerateJobStats} disabled={generatingJobStats}
                  className="flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-600/40 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/30 whitespace-nowrap"
                >
                  {generatingJobStats ? (
                    <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-violet-300/30 border-t-violet-500 dark:border-violet-400/30 dark:border-t-violet-300" />스탯 생성 중…</>
                  ) : <>✨ AI 스탯 채우기</>}
                </button>
              </div>
              {jobStatsError && <p className="text-xs text-red-400">{jobStatsError}</p>}

              {/* 직업 설명 입력 */}
              <div className="space-y-1.5">
                {jobDefs.map((job, ji) => (
                  <div key={job.id} className="flex items-center gap-2 rounded-lg border border-black/5 bg-white/60 px-2.5 py-1.5 dark:border-white/5 dark:bg-white/5">
                    <span className="w-20 flex-shrink-0 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      {JOB_EMOJI[job.id] ?? "👤"} {job.name}
                    </span>
                    <input
                      type="text"
                      value={job.description}
                      onChange={(e) => setJobDefs((prev) => prev.map((j, i) => i === ji ? { ...j, description: e.target.value } : j))}
                      placeholder="직업 특성 설명 (AI 스탯 생성에 활용됩니다)"
                      maxLength={100}
                      className="flex-1 rounded border border-black/10 bg-white/80 px-2 py-1 text-xs outline-none focus:border-violet-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-black/10 dark:border-white/10">
                      <th className="pb-2 text-left font-medium text-neutral-500">직업</th>
                      {statSchema.flatMap((stat) => {
                        const cols = [
                          <th key={stat.key} className="pb-2 text-center font-medium text-neutral-500 whitespace-nowrap">
                            {stat.icon} {stat.label}
                          </th>,
                        ];
                        if (stat.max_key) {
                          cols.push(
                            <th key={stat.max_key} className="pb-2 text-center font-medium text-neutral-400 whitespace-nowrap text-[10px]">
                              {stat.label} 최대
                            </th>
                          );
                        }
                        return cols;
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/5">
                    {jobDefs.map((job, ji) => (
                      <tr key={job.id}>
                        <td className="py-2 pr-3 font-medium text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                          {JOB_EMOJI[job.id] ?? "👤"} {job.name}
                        </td>
                        {statSchema.flatMap((stat) => {
                          const defaultVal = stat.display === "bar" ? 100 : 10;
                          const cols = [
                            <td key={stat.key} className="py-2 px-1 text-center">
                              <input
                                type="number"
                                min={0}
                                max={9999}
                                value={job.base_stats[stat.key] ?? defaultVal}
                                onChange={(e) => updateJobStat(ji, stat.key, Number(e.target.value))}
                                className="w-16 rounded-lg border border-black/10 bg-white/80 px-2 py-1 text-center text-xs outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-white/5 dark:text-white"
                              />
                            </td>,
                          ];
                          if (stat.max_key) {
                            cols.push(
                              <td key={stat.max_key} className="py-2 px-1 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={9999}
                                  value={job.base_stats[stat.max_key] ?? defaultVal}
                                  onChange={(e) => updateJobStat(ji, stat.max_key!, Number(e.target.value))}
                                  className="w-16 rounded-lg border border-black/10 bg-white/80 px-2 py-1 text-center text-xs outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-white/5 dark:text-white opacity-70"
                                />
                              </td>
                            );
                          }
                          return cols;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {jobDefs.length === 0 && (
            <p className="text-xs text-neutral-400">
              AI 자동 제안 버튼을 누르거나 직업 설정 단계로 돌아가 직업을 활성화하면 자동으로 채워집니다.
            </p>
          )}

          {saveError && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500 dark:text-red-400">
              {saveError}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setSubStep("objectives")}
              className="flex-1 rounded-lg border border-black/10 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              ← 이전
            </button>
            <button
              onClick={() => setSubStep("lore")}
              className="flex-1 rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              다음 →
            </button>
          </div>
        </div>
      )}

      {/* ── Step F: 세계관 Lore ─────────────────────────────────────── */}
      {subStep === "lore" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              플레이어가 조사 행동 시 발동될 세계관 정보 조각을 설계합니다. 생략해도 게임은 진행됩니다.
            </p>
          </div>

          {/* AI 버튼 행 */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleGenerateLore}
              disabled={generatingLore}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {generatingLore ? (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : "✨"}
              AI 자동 생성
            </button>
            <button
              onClick={handleAnalyzeLoreGaps}
              disabled={analyzingLore}
              className="flex items-center gap-1.5 rounded-lg border border-teal-400 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 disabled:opacity-50 dark:border-teal-600/50 dark:bg-teal-900/20 dark:text-teal-300 dark:hover:bg-teal-900/30"
            >
              {analyzingLore ? (
                <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-teal-400/30 border-t-teal-500 dark:border-teal-400/30 dark:border-t-teal-300" />분석 중…</>
              ) : <>🔍 AI 보완 분석</>}
            </button>
            <span className="text-xs text-neutral-400">
              {loreItems.length > 0 ? `${loreItems.length}개 항목` : "시나리오 설정을 바탕으로 Lore를 자동 생성합니다"}
            </span>
          </div>

          {loreError && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{loreError}</p>
          )}
          {loreAnalysisError && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{loreAnalysisError}</p>
          )}

          {/* 보완 제안 카드 */}
          {loreGapSuggestions.length > 0 && (
            <div className="space-y-2 rounded-xl border border-teal-200 bg-teal-50/50 p-3 dark:border-teal-700/40 dark:bg-teal-900/10">
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                🔍 AI 보완 제안 ({loreGapSuggestions.length}개)
              </p>
              <p className="text-xs text-teal-600/80 dark:text-teal-400/80">
                이 시나리오 플레이에 필요할 것으로 예측되는 누락 Lore입니다. 각 항목을 채용하거나 건너뛸 수 있습니다.
              </p>
              {loreGapSuggestions.map((s, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg border p-3 text-xs transition ${
                    acceptedGapIndices.has(idx)
                      ? "border-teal-400 bg-teal-100/60 dark:border-teal-600 dark:bg-teal-900/30"
                      : "border-black/10 bg-white dark:border-white/10 dark:bg-white/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        s.domain === "WORLD_LORE"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                          : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                      }`}>
                        {s.domain === "WORLD_LORE" ? "세계" : "개인"}
                      </span>
                      <span className="text-neutral-500">[{s.category}]</span>
                      <span className="text-neutral-400">⚡{s.importance_weight}</span>
                    </div>
                    {acceptedGapIndices.has(idx) ? (
                      <span className="rounded-full bg-teal-500 px-2 py-0.5 text-[10px] font-semibold text-white">채용됨</span>
                    ) : (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => acceptLoreGapSuggestion(idx)}
                          className="rounded-lg bg-teal-500 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-teal-600"
                        >채용</button>
                        <button
                          onClick={() => dismissLoreGapSuggestion(idx)}
                          className="rounded-lg border border-black/10 px-2.5 py-1 text-[10px] text-neutral-500 hover:bg-neutral-100 dark:border-white/10 dark:hover:bg-white/10"
                        >건너뜀</button>
                      </div>
                    )}
                  </div>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-1.5">
                    {s.lore_text}
                  </p>
                  <p className="text-[10px] text-neutral-400">
                    키워드: {s.trigger_keywords.join(", ")}
                  </p>
                  <div className="mt-1.5 rounded bg-teal-50 px-2 py-1 text-[10px] text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
                    💡 {s.reason}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Lore 목록 */}
          {loreItems.length > 0 && (
            <div className="space-y-2">
              {loreItems.map((item, idx) => (
                <div key={idx} className="rounded-xl border border-black/10 bg-white/60 dark:border-white/10 dark:bg-white/5">
                  {/* 요약 행 */}
                  <div
                    className="flex cursor-pointer items-center gap-2 px-3 py-2"
                    onClick={() => setEditingLoreIdx(editingLoreIdx === idx ? null : idx)}
                  >
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${item.domain === "WORLD_LORE" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"}`}>
                      {item.domain === "WORLD_LORE" ? "세계" : "개인"}
                    </span>
                    <span className="text-xs text-neutral-500">[{item.category}]</span>
                    <span className="flex-1 truncate text-xs text-neutral-700 dark:text-neutral-300">{item.lore_text || "(내용 없음)"}</span>
                    <span className="text-xs text-neutral-400">⚡{item.importance_weight}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeLoreItem(idx); }}
                      className="text-neutral-400 hover:text-red-500"
                    >✕</button>
                  </div>

                  {/* 편집 폼 */}
                  {editingLoreIdx === idx && (
                    <div className="border-t border-black/5 px-3 py-3 space-y-2 dark:border-white/5">
                      <div className="flex gap-2">
                        <select
                          value={item.domain}
                          onChange={(e) => updateLoreItem(idx, { domain: e.target.value as LoreItem["domain"] })}
                          className="rounded border border-black/10 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-neutral-800 dark:text-white"
                        >
                          <option value="WORLD_LORE">WORLD_LORE (세계관)</option>
                          <option value="PERSONAL_LORE">PERSONAL_LORE (개인)</option>
                        </select>
                        <input
                          type="text"
                          value={item.category}
                          onChange={(e) => updateLoreItem(idx, { category: e.target.value })}
                          placeholder="카테고리 (장소, 인물, 역사…)"
                          className="flex-1 rounded border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-neutral-800 dark:text-white"
                        />
                      </div>
                      <textarea
                        value={item.lore_text}
                        onChange={(e) => updateLoreItem(idx, { lore_text: e.target.value })}
                        placeholder="Lore 내용 (150자 이내 권장)"
                        rows={2}
                        className="w-full rounded border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-neutral-800 dark:text-white resize-none"
                      />
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <p className="mb-1 text-xs text-neutral-400">트리거 키워드 (쉼표 구분)</p>
                          <input
                            type="text"
                            value={item.trigger_keywords.join(", ")}
                            onChange={(e) => updateLoreItem(idx, { trigger_keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })}
                            placeholder="신전, 고대 문자, 유물"
                            className="w-full rounded border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-neutral-800 dark:text-white"
                          />
                        </div>
                        <div className="flex-1">
                          <p className="mb-1 text-xs text-neutral-400">클러스터 태그 (쉼표 구분)</p>
                          <input
                            type="text"
                            value={item.cluster_tags.join(", ")}
                            onChange={(e) => updateLoreItem(idx, { cluster_tags: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })}
                            placeholder="엘프, 마법, 역사"
                            className="w-full rounded border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-neutral-800 dark:text-white"
                          />
                        </div>
                      </div>
                      <div className="flex gap-4 items-center">
                        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                          중요도
                          <input
                            type="range" min={1} max={10} value={item.importance_weight}
                            onChange={(e) => updateLoreItem(idx, { importance_weight: Number(e.target.value) })}
                            className="w-20"
                          />
                          <span className="w-4 text-center font-bold text-neutral-700 dark:text-neutral-300">{item.importance_weight}</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                          접근 레벨
                          <input
                            type="range" min={1} max={10} value={item.required_access_level}
                            onChange={(e) => updateLoreItem(idx, { required_access_level: Number(e.target.value) })}
                            className="w-20"
                          />
                          <span className="w-4 text-center font-bold text-neutral-700 dark:text-neutral-300">{item.required_access_level}</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 직접 추가 */}
          <button
            onClick={addEmptyLoreItem}
            className="rounded-lg border border-dashed border-black/20 px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-50 dark:border-white/20 dark:hover:bg-white/5 w-full"
          >
            + Lore 항목 직접 추가
          </button>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setSubStep("character")}
              className="flex-1 rounded-lg border border-black/10 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              ← 이전
            </button>
            <button
              onClick={() => setSubStep("npcs")}
              className="flex-1 rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              다음 →
            </button>
          </div>
        </div>
      )}

      {/* ── Step H: NPC 설계 ── */}
      {subStep === "npcs" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              게임에 등장할 NPC를 설계합니다. 생략하면 세션 시작 시 자동 생성됩니다.
            </p>
            <button
              onClick={handleGenerateNpcs}
              disabled={generatingNpcs}
              className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 whitespace-nowrap"
            >
              {generatingNpcs ? (
                <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white dark:border-neutral-900/30 dark:border-t-neutral-900" />생성 중…</>
              ) : <>✨ AI NPC 생성</>}
            </button>
          </div>
          {npcError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{npcError}</p>}

          {/* NPC 목록 */}
          {npcDrafts.length > 0 && (
            <div className="space-y-2">
              {npcDrafts.map((npc, idx) => (
                <div key={idx} className="rounded-xl border border-black/10 bg-white/60 dark:border-white/10 dark:bg-white/5">
                  {/* 요약 행 */}
                  <div
                    className="flex cursor-pointer items-center gap-2 px-3 py-2.5"
                    onClick={() => setExpandedNpcIdx(expandedNpcIdx === idx ? null : idx)}
                  >
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${
                      npc.role === "boss"    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" :
                      npc.role === "enemy"   ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" :
                      npc.role === "ally"    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
                                              "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
                    }`}>
                      {{ boss: "보스", enemy: "적대", ally: "우호", neutral: "중립" }[npc.role]}
                    </span>
                    <span className="flex-1 font-medium text-sm text-neutral-700 dark:text-neutral-300 truncate">
                      {npc.name || "(이름 없음)"}
                    </span>
                    <span className="text-xs text-neutral-400 truncate hidden sm:block">{npc.personality.slice(0, 30)}{npc.personality.length > 30 ? "…" : ""}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeNpcDraft(idx); }}
                      className="text-neutral-400 hover:text-red-500 flex-shrink-0"
                    >✕</button>
                  </div>

                  {/* 편집 패널 */}
                  {expandedNpcIdx === idx && (
                    <div className="border-t border-black/5 px-3 py-3 space-y-3 dark:border-white/5">
                      {/* 이름 + 역할 */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={npc.name}
                          onChange={(e) => updateNpcDraft(idx, { name: e.target.value })}
                          placeholder="NPC 이름"
                          maxLength={20}
                          className="flex-1 rounded border border-black/10 bg-white px-2 py-1.5 text-sm outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-neutral-800 dark:text-white"
                        />
                        <select
                          value={npc.role}
                          onChange={(e) => updateNpcDraft(idx, { role: e.target.value as NpcDraft["role"] })}
                          className="rounded border border-black/10 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-neutral-800 dark:text-white"
                        >
                          <option value="ally">우호 (ally)</option>
                          <option value="neutral">중립 (neutral)</option>
                          <option value="enemy">적대 (enemy)</option>
                          <option value="boss">보스 (boss)</option>
                        </select>
                      </div>

                      {/* 성격 */}
                      <textarea
                        value={npc.personality}
                        onChange={(e) => updateNpcDraft(idx, { personality: e.target.value })}
                        placeholder="성격 묘사"
                        rows={2}
                        className="w-full rounded border border-black/10 bg-white px-2 py-1.5 text-xs outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-neutral-800 dark:text-white resize-none"
                      />

                      {/* 숨겨진 동기 */}
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">숨겨진 동기 (GM only)</p>
                        <input
                          type="text"
                          value={npc.hidden_motivation.goal}
                          onChange={(e) => updateNpcDraft(idx, { hidden_motivation: { ...npc.hidden_motivation, goal: e.target.value } })}
                          placeholder="목표 (예: 마을을 지배하려 한다)"
                          className="w-full rounded border border-black/10 bg-white px-2 py-1.5 text-xs outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-neutral-800 dark:text-white"
                        />
                        <input
                          type="text"
                          value={npc.hidden_motivation.secret}
                          onChange={(e) => updateNpcDraft(idx, { hidden_motivation: { ...npc.hidden_motivation, secret: e.target.value } })}
                          placeholder="비밀 (예: 사실 왕족 후손이다)"
                          className="w-full rounded border border-black/10 bg-white px-2 py-1.5 text-xs outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-neutral-800 dark:text-white"
                        />
                      </div>

                      {/* 저항 스탯 */}
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">저항 스탯 (DC 기준값)</p>
                        <div className="flex gap-2">
                          {(["physical_defense", "mental_willpower", "perception"] as const).map((key) => (
                            <label key={key} className="flex-1 flex flex-col items-center gap-0.5 text-[10px] text-neutral-400">
                              {{ physical_defense: "물리방어", mental_willpower: "정신의지", perception: "지각" }[key]}
                              <input
                                type="number"
                                min={1} max={20}
                                value={npc.resistance_stats[key]}
                                onChange={(e) => updateNpcDraft(idx, { resistance_stats: { ...npc.resistance_stats, [key]: Number(e.target.value) } })}
                                className="w-full rounded border border-black/10 bg-white px-1.5 py-1 text-center text-xs outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-neutral-800 dark:text-white"
                              />
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* 역할 지시어 */}
                      <div>
                        <p className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">역할 지시어 (AI 대화 시 사용)</p>
                        <textarea
                          value={npc.system_prompt}
                          onChange={(e) => updateNpcDraft(idx, { system_prompt: e.target.value })}
                          placeholder="이 NPC로 대화할 때 AI가 따를 지침"
                          rows={3}
                          className="w-full rounded border border-black/10 bg-white px-2 py-1.5 text-xs outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-neutral-800 dark:text-white resize-none"
                        />
                      </div>

                      {/* 커스텀 트리거 */}
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">자발적 행동 트리거</p>
                          <button
                            onClick={() => addCustomTrigger(idx)}
                            className="rounded px-2 py-0.5 text-xs bg-neutral-100 hover:bg-neutral-200 dark:bg-white/10 dark:hover:bg-white/20"
                          >
                            + 추가
                          </button>
                        </div>
                        {(npc.custom_triggers ?? []).length === 0 && (
                          <p className="text-xs text-neutral-400 dark:text-neutral-500">트리거 없음 (내장 트리거만 적용)</p>
                        )}
                        {(npc.custom_triggers ?? []).map((ct, ctIdx) => (
                          <div key={ct.id} className="mb-2 rounded border border-black/10 bg-neutral-50 p-2 dark:border-white/10 dark:bg-neutral-800/50">
                            <div className="mb-1.5 flex items-center gap-1">
                              {/* 조건 필드 */}
                              <select
                                value={ct.condition_field}
                                onChange={(e) => updateCustomTrigger(idx, ctIdx, { condition_field: e.target.value })}
                                className="rounded border border-black/10 bg-white px-1.5 py-1 text-xs dark:border-white/10 dark:bg-neutral-700 dark:text-white"
                              >
                                <option value="affinity">호감도</option>
                                <option value="fear_survival">공포</option>
                                <option value="mental_stress">스트레스</option>
                                <option value="trust">신뢰</option>
                                <option value="suspicion">의심</option>
                                <option value="curiosity">호기심</option>
                              </select>
                              {/* 연산자 */}
                              <select
                                value={ct.condition_op}
                                onChange={(e) => updateCustomTrigger(idx, ctIdx, { condition_op: e.target.value as NpcCustomTrigger["condition_op"] })}
                                className="rounded border border-black/10 bg-white px-1.5 py-1 text-xs dark:border-white/10 dark:bg-neutral-700 dark:text-white"
                              >
                                <option value=">=">≥</option>
                                <option value="<=">≤</option>
                                <option value=">">{">"}</option>
                                <option value="<">{"<"}</option>
                              </select>
                              {/* 값 */}
                              <input
                                type="number"
                                value={ct.condition_value}
                                min={-100} max={100}
                                onChange={(e) => updateCustomTrigger(idx, ctIdx, { condition_value: Number(e.target.value) })}
                                className="w-16 rounded border border-black/10 bg-white px-1.5 py-1 text-center text-xs dark:border-white/10 dark:bg-neutral-700 dark:text-white"
                              />
                              {/* 1회성 */}
                              <label className="ml-auto flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={ct.once}
                                  onChange={(e) => updateCustomTrigger(idx, ctIdx, { once: e.target.checked })}
                                />
                                1회
                              </label>
                              {/* 삭제 */}
                              <button
                                onClick={() => removeCustomTrigger(idx, ctIdx)}
                                className="ml-1 text-neutral-400 hover:text-red-500 text-xs"
                              >✕</button>
                            </div>
                            {/* 행동 힌트 */}
                            <input
                              type="text"
                              value={ct.action_hint}
                              onChange={(e) => updateCustomTrigger(idx, ctIdx, { action_hint: e.target.value })}
                              placeholder="조건 충족 시 AI에게 전달할 행동 지침"
                              className="w-full rounded border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-yellow-500/60 dark:border-white/10 dark:bg-neutral-700 dark:text-white"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={addEmptyNpc}
            className="w-full rounded-lg border border-dashed border-black/20 px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-50 dark:border-white/20 dark:hover:bg-white/5"
          >
            + NPC 직접 추가
          </button>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setSubStep("lore")}
              className="flex-1 rounded-lg border border-black/10 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              ← 이전
            </button>
            <button
              onClick={() => setSubStep("rules")}
              className="flex-1 rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              다음 →
            </button>
          </div>
        </div>
      )}

      {/* ── Step G: 게임 룰 ── */}
      {subStep === "rules" && (
        <div className="space-y-6">
          {/* AI 룰 제안 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">AI 룰 제안</h3>
              <button
                onClick={handleGenerateRules}
                disabled={generatingRules}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
              >
                {generatingRules ? "분석 중..." : "✨ AI 제안 받기"}
              </button>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
              시나리오 테마와 목표를 분석해서 어울리는 게임 룰을 추천합니다. 각 제안을 수락하거나 무시할 수 있습니다.
            </p>
            {rulesError && <p className="text-xs text-red-500 mb-2">{rulesError}</p>}

            {rulesSuggestion && (
              <div className="space-y-2">
                {/* 정보 공개 규칙 제안 카드 */}
                {!infoSuggestionDismissed && (
                  <div className="rounded-lg border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 mb-0.5">
                          정보 공개 규칙 — 아이템 비공개 {rulesSuggestion.info_rules.private_items ? "ON" : "OFF"} / Lore 비공개 {rulesSuggestion.info_rules.private_lore ? "ON" : "OFF"}
                        </p>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">{rulesSuggestion.info_rules.reason}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={acceptInfoRuleSuggestion}
                          className="rounded px-2 py-1 text-xs bg-violet-600 text-white hover:bg-violet-500"
                        >
                          수락
                        </button>
                        <button
                          onClick={() => setInfoSuggestionDismissed(true)}
                          className="rounded px-2 py-1 text-xs text-neutral-500 hover:text-neutral-300"
                        >
                          무시
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 특수 자원 제안 카드 */}
                {rulesSuggestion.resource_rules.map((suggested, idx) => (
                  <div key={idx} className="rounded-lg border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 mb-0.5">
                          특수 자원 — {suggested.stat_key}
                        </p>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-1">{suggested.reason}</p>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 space-y-0.5">
                          {suggested.change_conditions.map((c, ci) => (
                            <p key={ci}>{c.delta > 0 ? "+" : ""}{c.delta} — {c.trigger}</p>
                          ))}
                          {suggested.depletion_effect && (
                            <p className="text-red-500 dark:text-red-400">고갈: {suggested.depletion_effect}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => acceptResourceRuleSuggestion(idx)}
                          className="rounded px-2 py-1 text-xs bg-violet-600 text-white hover:bg-violet-500"
                        >
                          수락
                        </button>
                        <button
                          onClick={() => setRulesSuggestion((prev) => prev ? { ...prev, resource_rules: prev.resource_rules.filter((_, i) => i !== idx) } : prev)}
                          className="rounded px-2 py-1 text-xs text-neutral-500 hover:text-neutral-300"
                        >
                          무시
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {infoSuggestionDismissed && rulesSuggestion.resource_rules.length === 0 && (
                  <p className="text-xs text-neutral-400 italic">모든 제안을 처리했습니다.</p>
                )}
              </div>
            )}
          </div>

          {/* 정보 공개 규칙 */}
          <div>
            <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">정보 공개 규칙</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
              어떤 정보를 발견한 플레이어에게만 보일지 설정합니다. 다른 플레이어 화면에는 숨겨지며, 본인 화면에는 🔒 표시가 붙습니다.
            </p>
            <div className="space-y-3">
              {([
                { key: "items", label: "아이템 획득 비공개", desc: "플레이어가 아이템을 줍거나 받았을 때 다른 플레이어에게 숨깁니다.", value: privateItems, set: setPrivateItems },
                { key: "lore",  label: "Lore 발견 비공개",  desc: "플레이어가 세계관 단서를 발견했을 때 다른 플레이어에게 숨깁니다.", value: privateLore,  set: setPrivateLore  },
              ] as const).map(({ key, label, desc, value, set }) => (
                <label key={key} className="flex items-start gap-3 cursor-pointer">
                  <div className="relative mt-0.5 shrink-0">
                    <input type="checkbox" className="sr-only" checked={value} onChange={(e) => set(e.target.checked)} />
                    <div className={`w-10 h-6 rounded-full transition-colors ${value ? "bg-indigo-600" : "bg-neutral-300 dark:bg-neutral-600"}`} />
                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${value ? "translate-x-4" : ""}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{label}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 특수 자원 규칙 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">특수 자원 규칙</h3>
              <button
                onClick={() => {
                  const firstStat = statSchema[0]?.key ?? "hp";
                  setResourceRules((prev) => [...prev, { stat_key: firstStat, change_conditions: [], depletion_effect: "" }]);
                }}
                className="text-xs text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
              >
                + 자원 추가
              </button>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
              시나리오에서 자동으로 변동되는 특수 자원을 설정합니다. GM AI가 상황에 맞게 자동 조정합니다.
              (예: 호러 — 정신력 🧠이 공포 장면에서 감소)
            </p>
            <div className="space-y-3">
              {resourceRules.map((rule, rIdx) => (
                <div key={rIdx} className="rounded-lg border border-black/10 dark:border-white/10 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={rule.stat_key}
                      onChange={(e) => setResourceRules((prev) => prev.map((r, i) => i === rIdx ? { ...r, stat_key: e.target.value } : r))}
                      className="flex-1 rounded border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-800 px-2 py-1 text-xs"
                    >
                      {statSchema.map((s) => (
                        <option key={s.key} value={s.key}>{s.icon ? `${s.icon} ` : ""}{s.label} ({s.key})</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setResourceRules((prev) => prev.filter((_, i) => i !== rIdx))}
                      className="text-xs text-red-500 hover:text-red-400 px-1"
                    >
                      삭제
                    </button>
                  </div>
                  <div className="space-y-1">
                    {rule.change_conditions.map((cond, cIdx) => (
                      <div key={cIdx} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="조건 설명 (예: 공포 장면 목격)"
                          value={cond.trigger}
                          onChange={(e) => setResourceRules((prev) => prev.map((r, i) => i === rIdx ? {
                            ...r,
                            change_conditions: r.change_conditions.map((c, j) => j === cIdx ? { ...c, trigger: e.target.value } : c)
                          } : r))}
                          className="flex-1 rounded border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-800 px-2 py-1 text-xs"
                        />
                        <input
                          type="number"
                          placeholder="±"
                          value={cond.delta}
                          onChange={(e) => setResourceRules((prev) => prev.map((r, i) => i === rIdx ? {
                            ...r,
                            change_conditions: r.change_conditions.map((c, j) => j === cIdx ? { ...c, delta: Number(e.target.value) } : c)
                          } : r))}
                          className="w-16 rounded border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-800 px-2 py-1 text-xs text-center"
                        />
                        <button
                          onClick={() => setResourceRules((prev) => prev.map((r, i) => i === rIdx ? {
                            ...r,
                            change_conditions: r.change_conditions.filter((_, j) => j !== cIdx)
                          } : r))}
                          className="text-xs text-neutral-400 hover:text-red-400"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setResourceRules((prev) => prev.map((r, i) => i === rIdx ? {
                        ...r,
                        change_conditions: [...r.change_conditions, { trigger: "", delta: -10 }]
                      } : r))}
                      className="text-xs text-neutral-500 hover:text-neutral-300"
                    >
                      + 조건 추가
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="고갈 효과 (선택, 예: 패닉 상태 — 행동 제한)"
                    value={rule.depletion_effect ?? ""}
                    onChange={(e) => setResourceRules((prev) => prev.map((r, i) => i === rIdx ? { ...r, depletion_effect: e.target.value } : r))}
                    className="w-full rounded border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-800 px-2 py-1 text-xs"
                  />
                </div>
              ))}
              {resourceRules.length === 0 && (
                <p className="text-xs text-neutral-400 italic">자원 규칙 없음 — 기본 HP 변동만 적용됩니다.</p>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setSubStep("lore")}
              className="flex-1 rounded-lg border border-black/10 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              ← 이전
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? "저장 중..." : "시나리오 저장"}
            </button>
          </div>
          {saveError && <p className="text-sm text-red-500">{saveError}</p>}
        </div>
      )}
    </div>
  );
}
