"use client";

import { useRef, useState } from "react";
import Image from "next/image";

type PortraitMode = "none" | "generate" | "url" | "upload";

interface FormValues {
  name: string;
  bio: string;
  personality: string;
  creator_bio: string;
  is_public: boolean;
  portrait_mode: PortraitMode;
  portrait_url_input: string;
  portrait_file: File | null;
}

interface Props {
  onSubmit: (values: FormValues) => Promise<void>;
  onCancel: () => void;
  initialValues?: Partial<Omit<FormValues, "portrait_file">>;
  submitLabel?: string;
}

const PORTRAIT_TABS: { mode: PortraitMode; label: string }[] = [
  { mode: "none",     label: "없음" },
  { mode: "generate", label: "AI 생성" },
  { mode: "url",      label: "URL 입력" },
  { mode: "upload",   label: "파일 업로드" },
];

export default function CharacterForm({
  onSubmit,
  onCancel,
  initialValues,
  submitLabel = "캐릭터 만들고 대화 시작",
}: Props) {
  const [values, setValues] = useState<FormValues>({
    name:              initialValues?.name              ?? "",
    bio:               initialValues?.bio               ?? "",
    personality:       initialValues?.personality       ?? "",
    creator_bio:       initialValues?.creator_bio       ?? "",
    is_public:         initialValues?.is_public         ?? false,
    portrait_mode:     initialValues?.portrait_mode     ?? "none",
    portrait_url_input: initialValues?.portrait_url_input ?? "",
    portrait_file:     null,
  });
  const [errors, setErrors]   = useState<Partial<Record<keyof FormValues, string>>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function set(field: keyof FormValues, value: string | boolean | File | null) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function handleModeChange(mode: PortraitMode) {
    set("portrait_mode", mode);
    // 다른 모드 데이터 초기화
    set("portrait_url_input", "");
    set("portrait_file", null);
    setPreview(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    set("portrait_file", file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: typeof errors = {};
    if (!values.name.trim())        newErrors.name = "이름을 입력해주세요";
    if (!values.personality.trim()) newErrors.personality = "성격 설명을 입력해주세요";
    if (values.portrait_mode === "url" && !values.portrait_url_input.trim())
      newErrors.portrait_url_input = "URL을 입력해주세요";
    if (values.portrait_mode === "upload" && !values.portrait_file)
      newErrors.portrait_file = "파일을 선택해주세요";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    setLoading(true);
    try {
      await onSubmit(values);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* 이름 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-neutral-400">
          이름 <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="캐릭터 이름을 입력하세요"
          className={`rounded-xl border bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-purple-500 ${
            errors.name ? "border-red-400" : "border-white/10"
          }`}
        />
        {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
      </div>

      {/* 한 줄 소개 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-neutral-400">한 줄 소개</label>
        <input
          type="text"
          value={values.bio}
          onChange={(e) => set("bio", e.target.value)}
          placeholder="목록에 표시될 짧은 설명 (선택)"
          className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-purple-500"
        />
      </div>

      {/* 성격 설명 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-neutral-400">
          성격 설명 <span className="text-red-400">*</span>
        </label>
        <textarea
          value={values.personality}
          onChange={(e) => set("personality", e.target.value)}
          rows={5}
          placeholder={"이 캐릭터는 어떤 사람인가요? 말투, 성격, 배경, 특이한 버릇 등을 자유롭게 써주세요.\n\n예) 냉정한 겉모습과 달리 작은 친절에도 감동받는 전직 기사."}
          className={`resize-none rounded-xl border bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-purple-500 ${
            errors.personality ? "border-red-400" : "border-white/10"
          }`}
        />
        {errors.personality && <p className="text-xs text-red-400">{errors.personality}</p>}
        <p className="text-xs text-neutral-600">상세할수록 더 일관된 대화를 할 수 있어요.</p>
      </div>

      {/* 초상화 */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-neutral-400">초상화</label>

        {/* 모드 탭 */}
        <div className="flex gap-1.5">
          {PORTRAIT_TABS.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleModeChange(mode)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                values.portrait_mode === mode
                  ? "bg-purple-500 text-black"
                  : "border border-white/10 text-neutral-400 hover:border-white/20 hover:text-neutral-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* URL 입력 */}
        {values.portrait_mode === "url" && (
          <div className="flex flex-col gap-1.5">
            <input
              type="url"
              value={values.portrait_url_input}
              onChange={(e) => set("portrait_url_input", e.target.value)}
              placeholder="https://example.com/portrait.jpg"
              className={`rounded-xl border bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-purple-500 ${
                errors.portrait_url_input ? "border-red-400" : "border-white/10"
              }`}
            />
            {errors.portrait_url_input && (
              <p className="text-xs text-red-400">{errors.portrait_url_input}</p>
            )}
            {values.portrait_url_input && (
              <div className="relative h-24 w-24 overflow-hidden rounded-xl border border-white/10">
                <Image
                  src={values.portrait_url_input}
                  alt="미리보기"
                  fill
                  className="object-cover"
                  onError={() => {}}
                />
              </div>
            )}
          </div>
        )}

        {/* 파일 업로드 */}
        {values.portrait_mode === "upload" && (
          <div className="flex flex-col gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border border-dashed border-white/20 py-3 text-sm text-neutral-400 transition-colors hover:border-white/30 hover:text-neutral-300"
            >
              {values.portrait_file ? values.portrait_file.name : "이미지 파일 선택"}
            </button>
            {errors.portrait_file && (
              <p className="text-xs text-red-400">{errors.portrait_file}</p>
            )}
            {preview && (
              <div className="relative h-24 w-24 overflow-hidden rounded-xl border border-white/10">
                <Image src={preview} alt="미리보기" fill className="object-cover" />
              </div>
            )}
          </div>
        )}

        {/* AI 생성 안내 */}
        {values.portrait_mode === "generate" && (
          <p className="text-xs leading-relaxed text-neutral-500">
            캐릭터 생성 후 성격 설명을 바탕으로 AI가 자동으로 초상화를 만들어요.<br />
            생성에 10~20초 정도 걸릴 수 있어요.
          </p>
        )}
      </div>

      {/* 제작자 정보 */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="mb-1 text-[13px] font-semibold text-neutral-300">
          제작자 정보{" "}
          <span className="text-xs font-normal text-neutral-500">(선택)</span>
        </p>
        <p className="mb-3 text-xs leading-relaxed text-neutral-500">
          다른 사람이 &quot;너를 누가 만들었어?&quot; 라고 물으면 이 내용으로 답해요.
        </p>
        <textarea
          value={values.creator_bio}
          onChange={(e) => set("creator_bio", e.target.value)}
          rows={2}
          placeholder="예) 판타지를 좋아하는 개발자 uzifan이 만들었어."
          className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-purple-500"
        />
      </div>

      {/* 공개 토글 */}
      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-neutral-300">
        <input
          type="checkbox"
          checked={values.is_public}
          onChange={(e) => set("is_public", e.target.checked)}
          className="h-4 w-4 accent-purple-500"
        />
        친구들과 공유 (공개 캐릭터로 등록)
      </label>

      {/* 버튼 */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-neutral-400 transition-colors hover:bg-white/[0.05]"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-xl bg-purple-500 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? "처리 중…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
