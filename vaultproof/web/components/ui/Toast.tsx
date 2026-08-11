"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

interface ToastMessage {
  id: number;
  text: string;
}

const ToastContext = createContext<(text: string) => void>(() => {});

export function useToast(): (text: string) => void {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);

  const push = useCallback((text: string) => {
    const id = (nextId.current += 1);
    setMessages((prev) => [...prev.slice(-2), { id, text }]);
    window.setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }, 1600);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2"
        aria-live="polite"
        role="status"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className="animate-fade-up rounded border border-line-strong bg-surface-sunk px-3.5 py-2 text-[13px] font-medium text-ink shadow-hover"
          >
            {m.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
