"use client";

import { useState, useEffect, useRef } from "react";

export function useTurnTimer(timeoutAt: string | null, onTimeout: () => void) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const callbackRef = useRef(onTimeout);

  useEffect(() => {
    callbackRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    if (!timeoutAt) {
      setSecondsLeft(0);
      return;
    }

    const update = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(timeoutAt).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(remaining);
      if (remaining === 0) {
        callbackRef.current();
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [timeoutAt]);

  return secondsLeft;
}
