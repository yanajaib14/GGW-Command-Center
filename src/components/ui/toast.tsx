"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

export type ToastTone = "info" | "success" | "danger";

type ToastItem = { id: number; message: string; tone: ToastTone };

type ToastApi = { show: (message: string, tone?: ToastTone) => void };

const ToastContext = createContext<ToastApi | null>(null);

const DISMISS_MS = 4000;

const iconColour: Record<ToastTone, string> = {
  info: "text-muted",
  success: "text-success",
  danger: "text-danger",
};

/** Distinct glyph per tone so status never relies on colour alone. */
function ToneIcon({ tone }: { tone: ToastTone }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", iconColour[tone])}
    >
      <circle cx="12" cy="12" r="9" />
      {tone === "success" ? (
        <path d="M8 12.5l2.7 2.7L16 9.5" />
      ) : tone === "danger" ? (
        <path d="M9 9l6 6M15 9l-6 6" />
      ) : (
        <path d="M12 11v5M12 8h.01" />
      )}
    </svg>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const show = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextId.current++;
    setItems((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, DISMISS_MS);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {items.map((item) => (
          <p
            key={item.id}
            className="flex max-w-md items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-base text-fg shadow-soft"
          >
            <ToneIcon tone={item.tone} />
            {item.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}
