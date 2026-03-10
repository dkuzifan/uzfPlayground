"use client";

import { useState, useEffect, useCallback } from "react";
import type { GuestProfile } from "@/lib/types/lobby";

const STORAGE_KEY = "uzf_guest_profile";

export function useGuestProfile() {
  const [profile, setProfile] = useState<GuestProfile | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setProfile(JSON.parse(raw) as GuestProfile);
      } else {
        // 최초 방문 — localId 자동 생성 (닉네임/아바타는 첫 방 입장 시 설정)
        const init: GuestProfile = {
          localId: crypto.randomUUID(),
          nickname: "",
          avatarIndex: 0,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(init));
        setProfile(init);
      }
    } catch {
      // localStorage 실패 시 임시 프로필 (세션 내에서만 유지)
      setProfile({ localId: crypto.randomUUID(), nickname: "", avatarIndex: 0 });
    }
  }, []);

  /** 방 입장/생성 후 nickname + avatarIndex 업데이트 */
  const saveProfile = useCallback((nickname: string, avatarIndex: number) => {
    setProfile((prev) => {
      const updated: GuestProfile = {
        localId: prev?.localId ?? crypto.randomUUID(),
        nickname,
        avatarIndex,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // 저장 실패 시 세션 내에서만 유지
      }
      return updated;
    });
  }, []);

  return {
    /** localStorage 마운트 전에는 null — SSR hydration mismatch 방지 */
    profile: mounted ? profile : null,
    mounted,
    saveProfile,
  };
}
