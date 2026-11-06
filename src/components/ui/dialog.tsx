"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/** Modal built on the native dialog element: focus trap and Escape come from the platform. */
export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-full max-w-md rounded-lg border border-line bg-surface p-4 text-fg backdrop:bg-fg/50"
    >
      <h2 id={titleId} className="mb-3 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
