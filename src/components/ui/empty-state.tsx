import type { ReactNode } from "react";

export type EmptyStateProps = {
  title: string;
  body?: string;
  action?: ReactNode;
};

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <p className="text-lg font-semibold text-fg">{title}</p>
      {body ? <p className="text-base text-muted">{body}</p> : null}
      {action ?? null}
    </div>
  );
}
