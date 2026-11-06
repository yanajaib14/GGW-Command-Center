import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-line text-fg",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-1 text-sm font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
