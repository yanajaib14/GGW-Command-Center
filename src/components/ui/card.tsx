import type { ReactNode } from "react";

export type CardProps = { title?: string; children: ReactNode };

export function Card({ title, children }: CardProps) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      {title ? (
        <h2 className="mb-3 text-lg font-semibold text-fg">{title}</h2>
      ) : null}
      {children}
    </section>
  );
}
