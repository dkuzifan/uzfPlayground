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
      }
    } catch {
      // localStorage 파싱 실패 시 무시 → 모달 표시
    }
  }, []);

  const saveProfile = useCallback((p: Omit<GuestProfile, "localId"> & { localId?: string }) => {
    const localId = p.localId ?? crypto.randomUUID();
    const full: GuestProfile = { ...p, localId };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
    } catch {
      // 저장 실패 시 세션 내에서만 유지
    }
    setProfile(full);
  }, []);

  return {
    /** localStorage 마운트 전에는 null — SSR hydration mismatch 방지 */
    profile: mounted ? profile : null,
    mounted,
    saveProfile,
  };
}
