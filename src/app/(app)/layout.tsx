import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { RoutedAppShell } from "@/components/shell/routed-app-shell";
import type { Actor } from "@/server/auth/actor";
import { Forbidden, Unauthenticated } from "@/server/auth/errors";
import { requireActor } from "@/server/auth/require";

export default async function AppLayout({ children }: { children: ReactNode }) {
  let actor: Actor;
  try {
    actor = await requireActor();
  } catch (error) {
    if (error instanceof Unauthenticated) redirect("/sign-in");
    if (error instanceof Forbidden) redirect("/no-access");
    throw error;
  }
  return <RoutedAppShell actor={actor}>{children}</RoutedAppShell>;
}
