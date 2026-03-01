"use client";

import { useEffect, useRef } from "react";
import StreamingText from "@/components/ui/StreamingText";
import type { ActionLog } from "@/lib/types/game";

interface ChatLogProps {
  logs: ActionLog[];
  streamingText?: string;
}

const speakerColors: Record<string, string> = {
  gm: "text-yellow-400",
  player: "text-blue-400",
  npc: "text-green-400",
  system: "text-neutral-500",
};

export default function ChatLog({ logs, streamingText }: ChatLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, streamingText]);

  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-4">
      {logs.map((log) => (
        <div key={log.id} className="text-sm">
          <span className={`font-semibold ${speakerColors[log.speaker_type] ?? "text-white"}`}>
            [{log.speaker_name}]
          </span>{" "}
          <span className="text-neutral-200">{log.content}</span>
          {log.outcome && (
            <span className="ml-2 text-xs text-neutral-500">({log.outcome})</span>
          )}
        </div>
      ))}

      {streamingText && (
        <div className="text-sm">
          <span className={`font-semibold ${speakerColors.gm}`}>[GM]</span>{" "}
          <StreamingText text={streamingText} className="text-neutral-200" />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
