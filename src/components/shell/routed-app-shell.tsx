"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { Actor } from "@/server/auth/actor";
import { experienceFromPath } from "@/server/landing";
import { AppShell } from "./app-shell";

/**
 * Next layouts do not re-render on client navigation and there is no
 * supported way to read the request path in one, so the experience is derived
 * here from `usePathname()`.
 */
export function RoutedAppShell({
  actor,
  children,
}: {
  actor: Actor;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <AppShell actor={actor} experience={experienceFromPath(pathname)}>
      {children}
    </AppShell>
  );
}
