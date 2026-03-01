"use client";

import { useEffect, useRef, useState } from "react";

interface StreamingTextProps {
  text: string;
  speed?: number; // ms per character
  className?: string;
  onComplete?: () => void;
}

export default function StreamingText({
  text,
  speed = 20,
  className = "",
  onComplete,
}: StreamingTextProps) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    indexRef.current = 0;
    setDisplayed("");

    const interval = setInterval(() => {
      if (indexRef.current >= text.length) {
        clearInterval(interval);
        onComplete?.();
        return;
      }
      indexRef.current++;
      setDisplayed(text.slice(0, indexRef.current));
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, onComplete]);

  return (
    <span className={className}>
      {displayed}
      {displayed.length < text.length && (
        <span className="animate-pulse">▊</span>
      )}
    </span>
  );
}
