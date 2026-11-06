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
  const className = cn(
    "flex min-h-touch items-center justify-between gap-3 border-b border-line px-4 py-3",
    href && cn("hover:bg-bg", focusRing),
  );
  const content = (
    <>
      <span className="flex min-w-0 flex-col">
        <span className="text-base text-fg">{title}</span>
        {subtitle ? (
          <span className="text-sm text-muted">{subtitle}</span>
        ) : null}
      </span>
      {trailing ? (
        <span className="shrink-0 text-sm text-muted">{trailing}</span>
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
