import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BannerTone = "info" | "warning" | "danger";

const iconColour: Record<BannerTone, string> = {
  info: "text-muted",
  warning: "text-warning",
  danger: "text-danger",
};

/** Distinct glyph per tone so status never relies on colour alone. */
function ToneIcon({ tone }: { tone: BannerTone }) {
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
      className={cn("mt-0.5 shrink-0", iconColour[tone])}
    >
      {tone === "info" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </>
      ) : tone === "warning" ? (
        <>
          <path d="M12 3l10 18H2z" />
          <path d="M12 10v4M12 17.5h.01" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9l6 6M15 9l-6 6" />
        </>
      )}
    </svg>
  );
}

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
      className="flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-3 text-base text-fg"
    >
      <ToneIcon tone={tone} />
      {children}
    </div>
  );
}
