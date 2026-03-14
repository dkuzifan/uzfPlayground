"use client";

import { useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: "md" | "lg";
  children: React.ReactNode;
}

export default function Modal({ open, onClose, title, size = "md", children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full rounded-xl border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-900 ${size === "lg" ? "max-w-2xl" : "max-w-md"} flex max-h-[90vh] flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex-shrink-0 px-6 pt-6 pb-4">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              {title}
            </h2>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}
