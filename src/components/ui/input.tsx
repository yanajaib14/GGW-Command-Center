import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { focusRing } from "./focus";

export const controlClass = cn(
  "min-h-touch w-full rounded-md border border-control-border bg-surface px-3 text-base text-fg transition-colors duration-150 ease-out",
  "aria-[invalid=true]:border-danger disabled:opacity-60",
  focusRing,
);

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...rest }: InputProps) {
  return <input {...rest} className={cn(controlClass, className)} />;
}
