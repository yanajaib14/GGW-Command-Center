import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { controlClass } from "./input";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...rest }: SelectProps) {
  return (
    <select {...rest} className={cn(controlClass, className)}>
      {children}
    </select>
  );
}
