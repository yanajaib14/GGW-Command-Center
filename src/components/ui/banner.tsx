import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BannerTone = "info" | "warning" | "danger";

const tones: Record<BannerTone, string> = {
  info: "border-accent bg-accent/15",
  warning: "border-warning bg-warning/15",
  danger: "border-danger bg-danger/15",
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
        "rounded-md border px-4 py-3 text-base text-fg",
        tones[tone],
      )}
    >
      {children}
    </div>
  );
}
