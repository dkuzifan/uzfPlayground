"use client";

import { useState } from "react";
import type { PersonalityProfile, MBTIType, EnneagramType, DnDAlignment, CharacterJob } from "@/lib/types/character";

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface StepProps {
  onNext: (data: Partial<Result>) => void;
}

interface Result {
  mbti: MBTIType;
  enneagram: EnneagramType;
  dnd_alignment: DnDAlignment;
  characterName: string;
  job: CharacterJob;
}

interface Props {
  onComplete: (personality: PersonalityProfile, characterName: string, job: CharacterJob) => void;
}

// ── MBTI 데이터 ───────────────────────────────────────────────────────────────

const MBTI_QUESTIONS = [
  {
    axis: "EI" as const,
    question: "새 에너지를 얻는 방식은?",
    a: { label: "사람들과 어울리며 활기를 얻는다", value: "E" },
    b: { label: "혼자만의 시간으로 충전한다", value: "I" },
  },
  {
    axis: "SN" as const,
    question: "정보를 받아들일 때 선호하는 것은?",
    a: { label: "구체적인 사실과 직접 경험", value: "S" },
    b: { label: "패턴과 가능성, 큰 그림", value: "N" },
  },
  {
    axis: "TF" as const,
    question: "결정을 내릴 때 중심에 두는 것은?",
    a: { label: "논리, 원칙, 분석", value: "T" },
    b: { label: "감정, 공감, 관계", value: "F" },
  },
  {
    axis: "JP" as const,
    question: "삶을 살아가는 방식은?",
    a: { label: "계획을 세우고 체계적으로", value: "J" },
    b: { label: "유연하게, 흐름에 따라", value: "P" },
  },
];

// ── 에니어그램 데이터 ──────────────────────────────────────────────────────────

const ENNEAGRAM_TYPES: { type: EnneagramType; name: string; keyword: string; desc: string }[] = [
  { type: 1, name: "개혁가", keyword: "원칙과 완벽", desc: "옳고 그름에 민감하며 더 나은 세상을 추구한다." },
  { type: 2, name: "조력자", keyword: "사랑과 봉사", desc: "타인을 돕고 관계를 소중히 여기며 필요받고 싶어한다." },
  { type: 3, name: "성취자", keyword: "성공과 효율", desc: "목표 달성에 집중하며 성공적인 이미지를 추구한다." },
  { type: 4, name: "개인주의자", keyword: "정체성과 감성", desc: "자신만의 독특함을 추구하며 깊은 감정을 중시한다." },
  { type: 5, name: "탐구자", keyword: "지식과 독립", desc: "관찰하고 분석하며 지식을 통해 세상을 이해하려 한다." },
  { type: 6, name: "충성가", keyword: "안전과 신뢰", desc: "충성스럽고 책임감이 강하며 불확실성을 경계한다." },
  { type: 7, name: "열정가", keyword: "모험과 즐거움", desc: "새로운 경험을 추구하며 고통보다 기쁨을 향해 달린다." },
  { type: 8, name: "도전자", keyword: "힘과 주도권", desc: "강하고 직접적이며 자신과 약자를 보호하려 한다." },
  { type: 9, name: "평화주의자", keyword: "평화와 조화", desc: "갈등을 피하고 내면의 평화와 모두의 화합을 원한다." },
];

// ── D&D 성향 데이터 ────────────────────────────────────────────────────────────

const DND_GRID: { value: DnDAlignment; label: string; desc: string }[][] = [
  [
    { value: "lawful-good",    label: "질서 선",    desc: "규칙을 따르며 타인을 돕는다" },
    { value: "neutral-good",   label: "중립 선",    desc: "선을 위해 필요한 방법을 택한다" },
    { value: "chaotic-good",   label: "혼돈 선",    desc: "자유롭게, 그러나 선한 의도로" },
  ],
  [
    { value: "lawful-neutral", label: "질서 중립",  desc: "규칙과 질서 자체를 따른다" },
    { value: "true-neutral",   label: "순수 중립",  desc: "균형을 유지하며 극단을 피한다" },
    { value: "chaotic-neutral",label: "혼돈 중립",  desc: "자유를 최우선으로 여긴다" },
  ],
  [
    { value: "lawful-evil",    label: "질서 악",    desc: "체계적으로 자신의 이익을 추구한다" },
    { value: "neutral-evil",   label: "중립 악",    desc: "목적을 위해 수단을 가리지 않는다" },
    { value: "chaotic-evil",   label: "혼돈 악",    desc: "충동적이고 파괴적인 의지를 따른다" },
  ],
];

// ── 직업 데이터 ────────────────────────────────────────────────────────────────

const JOBS: { value: CharacterJob; label: string; desc: string; icon: string }[] = [
  { value: "warrior", label: "전사",    desc: "강인한 체력과 전투 기술",        icon: "⚔️" },
  { value: "mage",    label: "마법사",  desc: "강력한 마법과 지식",             icon: "🔮" },
  { value: "rogue",   label: "도적",    desc: "은신과 기습에 특화",             icon: "🗡️" },
  { value: "cleric",  label: "성직자",  desc: "신성한 힘으로 치유와 보호",      icon: "✨" },
  { value: "ranger",  label: "레인저",  desc: "원거리 전투와 자연 탐색",        icon: "🏹" },
  { value: "paladin", label: "팔라딘",  desc: "정의와 신념의 성전사",           icon: "🛡️" },
  { value: "bard",    label: "음유시인",desc: "말과 음악으로 세상을 움직인다",   icon: "🎶" },
];

// ── Step 1: MBTI ───────────────────────────────────────────────────────────────

function StepMbti({ onNext }: StepProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const done = Object.keys(answers).length === MBTI_QUESTIONS.length;

  function calcMbti(): MBTIType {
    return (
      (answers["EI"] || "E") +
      (answers["SN"] || "S") +
      (answers["TF"] || "T") +
      (answers["JP"] || "J")
    ) as MBTIType;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
          Step 1 · 성향 파악 (MBTI)
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          직감적으로 가깝다고 느껴지는 항목을 선택하세요.
        </p>
      </div>

      {MBTI_QUESTIONS.map((q) => (
        <div key={q.axis} className="space-y-2">
          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{q.question}</p>
          <div className="grid grid-cols-2 gap-2">
            {[q.a, q.b].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAnswers((prev) => ({ ...prev, [q.axis]: opt.value }))}
                className={`rounded-lg border px-4 py-3 text-left text-sm transition ${
                  answers[q.axis] === opt.value
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/10 dark:text-indigo-300"
                    : "border-black/10 bg-white hover:border-black/20 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <button
        disabled={!done}
        onClick={() => onNext({ mbti: calcMbti() })}
        className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        다음 →
      </button>
    </div>
  );
}

// ── Step 2: 에니어그램 ─────────────────────────────────────────────────────────

function StepEnneagram({ onNext }: StepProps) {
  const [selected, setSelected] = useState<EnneagramType | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
          Step 2 · 내면의 동기 (에니어그램)
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          가장 깊은 욕구와 두려움을 대변하는 유형을 선택하세요.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {ENNEAGRAM_TYPES.map((t) => (
          <button
            key={t.type}
            onClick={() => setSelected(t.type)}
            className={`rounded-xl border p-3 text-left transition ${
              selected === t.type
                ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/10"
                : "border-black/10 bg-white hover:border-black/20 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`text-base font-black tabular-nums ${
                  selected === t.type
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-neutral-400"
                }`}
              >
                {t.type}
              </span>
              <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                {t.name}
              </span>
            </div>
            <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
              {t.keyword}
            </p>
            <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
              {t.desc}
            </p>
          </button>
        ))}
      </div>

      <button
        disabled={!selected}
        onClick={() => onNext({ enneagram: selected! })}
        className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        다음 →
      </button>
    </div>
  );
}

// ── Step 3: D&D 성향 ──────────────────────────────────────────────────────────

function StepAlignment({ onNext }: StepProps) {
  const [selected, setSelected] = useState<DnDAlignment | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
          Step 3 · 행동 원칙 (D&D 성향)
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          당신이 세상을 살아가는 방식과 가장 가까운 성향은?
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
        <div className="grid grid-cols-3">
          {["질서", "중립", "혼돈"].map((h) => (
            <div
              key={h}
              className="border-b border-black/10 py-1.5 text-center text-xs font-semibold text-neutral-500 dark:border-white/10 dark:text-neutral-400"
            >
              {h}
            </div>
          ))}
        </div>
        {DND_GRID.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3">
            {row.map((cell, ci) => (
              <button
                key={cell.value}
                onClick={() => setSelected(cell.value)}
                className={`flex flex-col items-center justify-center p-3 text-center transition ${
                  ri < 2 ? "border-b border-black/10 dark:border-white/10" : ""
                } ${ci < 2 ? "border-r border-black/10 dark:border-white/10" : ""} ${
                  selected === cell.value
                    ? "bg-indigo-50 dark:bg-indigo-500/10"
                    : "bg-white hover:bg-black/[0.03] dark:bg-transparent dark:hover:bg-white/5"
                }`}
              >
                <span
                  className={`text-xs font-bold ${
                    selected === cell.value
                      ? "text-indigo-600 dark:text-indigo-400"
                      : "text-neutral-700 dark:text-neutral-300"
                  }`}
                >
                  {cell.label}
                </span>
                <span className="mt-0.5 text-[10px] text-neutral-400 dark:text-neutral-500">
                  {cell.desc}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <button
        disabled={!selected}
        onClick={() => onNext({ dnd_alignment: selected! })}
        className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        다음 →
      </button>
    </div>
  );
}

// ── Step 4: 캐릭터 정보 ───────────────────────────────────────────────────────

function StepCharacter({ onNext }: StepProps) {
  const [name, setName] = useState("");
  const [job, setJob] = useState<CharacterJob | null>(null);
  const nameError = name.trim().length > 0 && name.trim().length > 16;
  const canSubmit = name.trim().length >= 1 && name.trim().length <= 16 && job !== null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
          Step 4 · 캐릭터 설정
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          이 세계에서 당신이 맡을 캐릭터를 설정하세요.
        </p>
      </div>

      {/* 이름 */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
          캐릭터 이름
        </label>
        <input
          type="text"
          maxLength={16}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 아리엘, 카인, Lysander"
          className="w-full rounded-lg border border-black/15 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-neutral-500"
        />
        {nameError && (
          <p className="text-xs text-red-500">최대 16자까지 입력할 수 있습니다.</p>
        )}
      </div>

      {/* 직업 */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">직업</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {JOBS.map((j) => (
            <button
              key={j.value}
              onClick={() => setJob(j.value)}
              className={`flex flex-col items-center rounded-xl border p-3 transition ${
                job === j.value
                  ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/10"
                  : "border-black/10 bg-white hover:border-black/20 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
              }`}
            >
              <span className="text-2xl">{j.icon}</span>
              <span
                className={`mt-1 text-xs font-bold ${
                  job === j.value
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-neutral-700 dark:text-neutral-300"
                }`}
              >
                {j.label}
              </span>
              <span className="mt-0.5 text-center text-[10px] text-neutral-400 dark:text-neutral-500">
                {j.desc}
              </span>
            </button>
          ))}
        </div>
      </div>

      <button
        disabled={!canSubmit}
        onClick={() => onNext({ characterName: name.trim(), job: job! })}
        className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        캐릭터 생성 완료
      </button>
    </div>
  );
}

// ── 결과 요약 화면 ─────────────────────────────────────────────────────────────

function StepResult({
  result,
  onConfirm,
}: {
  result: Result;
  onConfirm: () => void;
}) {
  const enneagram = ENNEAGRAM_TYPES.find((e) => e.type === result.enneagram);
  const job = JOBS.find((j) => j.value === result.job);
  const dndLabel =
    DND_GRID.flat().find((d) => d.value === result.dnd_alignment)?.label ?? result.dnd_alignment;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
          캐릭터 완성!
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          이 정보를 바탕으로 맞춤형 선택지가 제공됩니다.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-black/10 bg-black/[0.03] p-5 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{job?.icon}</span>
          <div>
            <p className="font-bold text-neutral-900 dark:text-white">{result.characterName}</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{job?.label}</p>
          </div>
        </div>
        <hr className="border-black/10 dark:border-white/10" />
        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <div>
            <p className="text-xs text-neutral-500">MBTI</p>
            <p className="font-bold text-indigo-600 dark:text-indigo-400">{result.mbti}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">에니어그램</p>
            <p className="font-bold text-indigo-600 dark:text-indigo-400">
              {result.enneagram}번 {enneagram?.name}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">D&D 성향</p>
            <p className="font-bold text-indigo-600 dark:text-indigo-400">{dndLabel}</p>
          </div>
        </div>
      </div>

      <button
        onClick={onConfirm}
        className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
      >
        로비로 이동
      </button>
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────

const STEPS = ["MBTI", "에니어그램", "D&D 성향", "캐릭터 설정"] as const;

export default function PersonalityTest({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [partial, setPartial] = useState<Partial<Result>>({});
  const [done, setDone] = useState(false);

  function handleNext(data: Partial<Result>) {
    const merged = { ...partial, ...data };
    setPartial(merged);
    if (step < 3) {
      setStep(step + 1);
    } else {
      setDone(true);
    }
  }

  if (done && partial.mbti && partial.enneagram && partial.dnd_alignment && partial.characterName && partial.job) {
    return (
      <StepResult
        result={partial as Result}
        onConfirm={() =>
          onComplete(
            {
              mbti: partial.mbti!,
              enneagram: partial.enneagram!,
              dnd_alignment: partial.dnd_alignment!,
              summary: "",
            },
            partial.characterName!,
            partial.job!
          )
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 스텝 인디케이터 */}
      <div className="flex items-center gap-1">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center">
            <div className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${
                  i < step
                    ? "bg-indigo-600 text-white"
                    : i === step
                      ? "border-2 border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                      : "border-2 border-black/15 text-neutral-400 dark:border-white/15"
                }`}
              >
                {i < step ? "✓" : i + 1}
              </div>
              <span className={`text-[10px] ${i === step ? "font-semibold text-indigo-600 dark:text-indigo-400" : "text-neutral-400"}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`mx-1 mb-4 h-px flex-1 ${i < step ? "bg-indigo-600" : "bg-black/10 dark:bg-white/10"}`} />
            )}
          </div>
        ))}
      </div>

      {/* 스텝 컨텐츠 */}
      {step === 0 && <StepMbti onNext={handleNext} />}
      {step === 1 && <StepEnneagram onNext={handleNext} />}
      {step === 2 && <StepAlignment onNext={handleNext} />}
      {step === 3 && <StepCharacter onNext={handleNext} />}
    </div>
  );
}
