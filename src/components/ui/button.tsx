import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { focusRing } from "./focus";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg",
  secondary: "bg-surface text-fg border border-line",
  danger: "bg-danger text-accent-fg",
  ghost: "bg-transparent text-accent",
};

const sizes: Record<ButtonSize, string> = {
  md: "min-h-touch px-4 text-base",
  lg: "min-h-touch px-6 text-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  type = "button",
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? "true" : undefined}
      className={cn(
        "inline-flex min-w-touch items-center justify-center gap-2 rounded-md font-medium",
        "disabled:cursor-not-allowed disabled:opacity-60",
        focusRing,
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
}
