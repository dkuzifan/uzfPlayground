export default function CharacterCreatePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold text-white">캐릭터 생성</h1>
      <p className="mb-8 text-neutral-400">
        성향 테스트를 완료하여 당신만의 캐릭터를 만드세요.
      </p>
      {/* TODO: PersonalityTest 컴포넌트 삽입 */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-neutral-500">
        성향 테스트 UI (구현 예정)
      </div>
    </div>
  );
}
