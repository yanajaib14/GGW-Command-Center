import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BannerTone = "info" | "warning" | "danger";

const tones: Record<BannerTone, string> = {
  info: "border-accent",
  warning: "border-warning",
  danger: "border-danger",
};

export function Banner({
  tone,
  children,
}: {
  tone: BannerTone;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      data-tone={tone}
      className={cn(
        "rounded-md border-l-4 bg-surface px-4 py-3 text-base text-fg",
        tones[tone],
      )}
    >
      {children}
    </div>
  );
}
