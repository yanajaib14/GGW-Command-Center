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
  // Set while the parent closes the dialog, so the resulting native close
  // event is not reported as a user-initiated close.
  const closingFromParent = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) {
      closingFromParent.current = true;
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        if (closingFromParent.current) {
          closingFromParent.current = false;
          return;
        }
        onClose();
      }}
      className="m-auto max-h-dvh w-full max-w-md overflow-y-auto rounded-lg border border-line bg-surface p-4 text-fg backdrop:bg-fg/50"
    >
      <h2 id={titleId} className="mb-3 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
