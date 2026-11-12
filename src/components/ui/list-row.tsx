import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { focusRing } from "./focus";

export type ListRowProps = {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  href?: string;
};

export function ListRow({ title, subtitle, trailing, href }: ListRowProps) {
  // Hairline divider inset from the left, like an iOS grouped list; the last
  // row in a group has none.
  const className = cn(
    "relative flex min-h-touch items-center justify-between gap-3 px-4 py-3",
    "after:absolute after:inset-x-0 after:bottom-0 after:left-4 after:h-px after:bg-line last:after:hidden",
    href &&
      cn(
        "transition-colors duration-150 ease-out hover:bg-bg active:bg-line",
        focusRing,
      ),
  );
  const content = (
    <>
      <span className="flex min-w-0 flex-col">
        <span className="text-base text-fg">{title}</span>
        {subtitle ? (
          <span className="text-sm text-muted">{subtitle}</span>
        ) : null}
      </span>
      {trailing || href ? (
        <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
          {trailing}
          {href ? (
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
          ) : null}
        </span>
      ) : null}
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
