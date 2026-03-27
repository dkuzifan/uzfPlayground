# 개선 검토 리포트 (2026-03-09)

> Phase 0~4 구현 완료 후 코드베이스 전체 검토 결과.
> 리스키한 항목, 불완전한 항목, 발전 방향을 정리함.
> **2026-03-10 전체 처리 완료** (8번·11번 제외)

---

## 🔴 리스키한 것들 (실제 문제 가능)

### 1. 클라이언트가 주사위 값을 조작할 수 있음
- **현황**: `DiceRollOverlay`가 d20을 클라이언트에서 굴리고 서버로 전송. DC는 서버 재검증하지만 `rolled` 값 자체는 신뢰함.
- **위험**: 악의적 사용자가 `rolled: 20`을 항상 보내면 크리티컬 성공 남발 가능.
- **결정**: 개인 프로젝트 규모상 실질적 위협이 낮아 **보류**. 공개 서비스 전환 시 재검토.
- **관련 파일**: `src/app/api/trpg/game/action/resolve/route.ts`, `src/components/trpg/game/DiceRollOverlay.tsx`

### 2. join API에서 `personality` 무검증 수신 ✅ 완료
- **해결**: MBTI 16종 / 에니어그램 1~9 / D&D 9성향 화이트리스트 검증 추가. job 검증 및 character_name 16자 슬라이스 포함.
- **커밋**: `fix: add server-side whitelist validation for personality/job in join API`

### 3. NPC_Persona를 브라우저 클라이언트로 직접 조회 ✅ 완료
- **해결**: 서버 API(`/api/trpg/game/session/[sessionId]`)에서 NPC 공개 필드만 SELECT하여 반환. `hidden_motivation`, `system_prompt` 클라이언트 미전송.
- **커밋**: `fix: fetch NPC data server-side, exclude hidden_motivation and system_prompt`

---

## 🟡 불완전한 것들 (동작하지만 한계 있음)

### 4. 멀티 NPC 미지원 ✅ 완료
- **해결**: `determineTargetedNpcs()` 함수 추가. 플레이어 텍스트에 NPC 이름이 언급되면 해당 NPC만, 없으면 세션 전체 NPC 대상. 감정 업데이트·대화 생성 모두 루프 처리.
- **커밋**: `feat: support multi-NPC targeting in action processing`

### 5. 캐릭터 생성 우회 가능 ✅ 완료
- **해결**: 로비 페이지에 `characterCreated: false` 시 안내 배너 + "테스트 시작" 버튼 표시.
- **커밋**: `feat: add character creation banner in lobby for incomplete profiles`

### 6. 메모리 파이프라인 에러 무음 처리 ✅ 완료
- **해결**: Gemini 요약 실패 시 1.5초 대기 후 1회 재시도. 최종 실패 시 `console.error` 로깅.
- **커밋**: `fix: add retry and error logging to memory pipeline`

### 7. 공통 함수 중복 정의 ✅ 완료
- **해결**: `src/lib/game/action-utils.ts`로 `defaultDynamicState`, `clamp`, `JOB_MODIFIERS`, `determineTargetedNpcs` 통합.
- **커밋**: `refactor: extract shared JOB_MODIFIERS, defaultDynamicState, clamp to action-utils`

---

## 🟢 발전시키면 좋을 것들

### 8. 직업별 초기 스탯 차별화
- **현황**: 모든 직업이 동일한 초기 HP/ATK/DEF 값으로 생성됨.
- **결정**: 시나리오별로 필요한 스탯이 달라 DB 스키마 설계가 선행되어야 함. **별도 작업으로 진행 예정**.
- **관련 파일**: `src/app/api/trpg/sessions/[sessionId]/join/route.ts`

### 9. 세션 환경 시각화 ✅ 완료
- **해결**: `GameSession.session_environment` 타입 추가. 게임 화면 채팅 로그 위에 날씨·시간대 배지 표시. 데이터 없으면 미표시.
- **커밋**: `feat: display session environment (weather/time) badge in game screen`

### 10. 퀘스트 트래커 UI ✅ 완료
- **해결**: `QuestTrackerPanel` 컴포넌트 추가. boolean 마일스톤은 체크마크, counter 마일스톤은 진행 바로 표시. 우측 사이드바에 배치.
- **커밋**: `feat: add QuestTrackerPanel to game sidebar`

### 11. 온보딩 흐름 강화 (테스트 진행 중 새로고침 복원)
- **결정**: 성향 테스트 자체를 추후 수정할 예정이므로 **스킵**. 테스트 구조가 확정된 후 구현하면 호환성 문제 없이 안전하게 적용 가능.

---

## 처리 현황 요약

| 항목 | 분류 | 상태 |
|------|------|------|
| 1. 주사위 서버 롤 | 🔴 보안 | 보류 (개인 프로젝트 규모) |
| 2. personality 검증 | 🔴 보안 | ✅ 완료 |
| 3. NPC 조회 서버 경유 | 🔴 보안 | ✅ 완료 |
| 4. 멀티 NPC 지원 | 🟡 기능 | ✅ 완료 |
| 5. 캐릭터 생성 배너 | 🟡 UX | ✅ 완료 |
| 6. 메모리 파이프라인 로깅 | 🟡 안정성 | ✅ 완료 |
| 7. 공통 함수 모듈화 | 🟡 코드품질 | ✅ 완료 |
| 8. 직업별 스탯 차별화 | 🟢 게임성 | 별도 진행 예정 |
| 9. 세션 환경 시각화 | 🟢 UX | ✅ 완료 |
| 10. 퀘스트 트래커 UI | 🟢 기능 | ✅ 완료 |
| 11. 온보딩 새로고침 복원 | 🟢 UX | 스킵 (테스트 개편 후 재검토) |
