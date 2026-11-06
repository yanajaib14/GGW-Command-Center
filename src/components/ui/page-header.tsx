import type { ReactNode } from "react";

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 pb-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold text-fg">{title}</h1>
        {subtitle ? <p className="text-base text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </header>
  );
}
