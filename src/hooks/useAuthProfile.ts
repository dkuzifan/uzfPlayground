"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export interface AuthProfile {
  userId: string;      // Supabase auth.uid() — DB Player_Character.user_id로 사용
  nickname: string;    // 최근 사용한 닉네임
  avatarIndex: number; // 0~7
}

const PROFILE_KEY_PREFIX = "uzf_profile_";

export function useAuthProfile() {
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;

      const userId = session.user.id;
      let nickname = "";
      let avatarIndex = 0;

      try {
        const raw = localStorage.getItem(`${PROFILE_KEY_PREFIX}${userId}`);
        if (raw) {
          const saved = JSON.parse(raw) as { nickname?: string; avatarIndex?: number };
          nickname = saved.nickname ?? "";
          avatarIndex = Math.min(7, Math.max(0, saved.avatarIndex ?? 0));
        }
      } catch { /* ignore */ }

      setProfile({ userId, nickname, avatarIndex });
    });
  }, []);

  const saveProfile = useCallback((nickname: string, avatarIndex: number) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, nickname, avatarIndex };
      try {
        localStorage.setItem(
          `${PROFILE_KEY_PREFIX}${prev.userId}`,
          JSON.stringify({ nickname, avatarIndex })
        );
      } catch { /* ignore */ }
      return updated;
    });
  }, []);

  return {
    profile: mounted ? profile : null,
    mounted,
    saveProfile,
  };
}
