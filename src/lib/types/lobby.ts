// ============================================================
// Lobby & Waiting Room Types
// ============================================================

/** localStorage에 저장되는 게스트 프로필 */
export interface GuestProfile {
  nickname: string;    // 최대 12자
  avatarIndex: number; // 0~7 (색상 원 인덱스)
  localId: string;     // crypto.randomUUID() — DB Player_Character.user_id로 사용
}

/** 로비 방 목록 카드 1개 */
export interface LobbySession {
  id: string;
  room_name: string;
  max_players: number;
  player_count: number;
  scenario_title: string;
}

/** 대기실 참여자 1명 */
export interface WaitingPlayer {
  id: string;          // Player_Character.id
  nickname: string;    // player_name
  avatarIndex: number; // personality_summary 파싱
  isHost: boolean;     // id === Game_Session.host_player_id
}

/** avatarIndex → Tailwind bg 클래스 매핑 */
export const AVATAR_COLORS: Record<number, string> = {
  0: "bg-red-400",
  1: "bg-orange-400",
  2: "bg-yellow-400",
  3: "bg-green-500",
  4: "bg-cyan-500",
  5: "bg-blue-500",
  6: "bg-purple-500",
  7: "bg-pink-500",
};

/** personality_summary 문자열에서 avatarIndex 파싱 */
export function parseAvatarIndex(summary: string | null): number {
  if (!summary) return 0;
  const idx = parseInt(summary.replace("avatar:", ""), 10);
  return isNaN(idx) ? 0 : Math.max(0, Math.min(7, idx));
}
