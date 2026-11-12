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
      className="m-auto max-h-dvh w-full max-w-md overflow-y-auto rounded-lg bg-surface p-5 text-fg shadow-soft backdrop:bg-black/40 backdrop:backdrop-blur-sm max-md:mb-0 max-md:max-w-none max-md:rounded-b-none max-md:pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
    >
      <h2 id={titleId} className="mb-3 text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
