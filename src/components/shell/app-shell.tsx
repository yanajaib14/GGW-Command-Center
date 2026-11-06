import type { ReactNode } from "react";
import type { Actor } from "@/server/auth/actor";
import { experiencesFor, navFor, type Experience } from "@/server/nav";
import { ExperienceSwitcher } from "./experience-switcher";
import { NavBar } from "./nav-bar";
import { OfflineBanner } from "./offline-banner";
import { RegisterSw } from "./register-sw";

export function AppShell({
  actor,
  experience,
  children,
}: {
  actor: Actor;
  experience: Experience;
  children: ReactNode;
}) {
  const items = navFor(actor, experience);
  const experiences = experiencesFor(actor);

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <NavBar items={items} />
      <div className="flex min-w-0 flex-1 flex-col pb-24 md:pb-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2">
          <span className="text-sm text-muted">{actor.displayName}</span>
          {experiences.length > 1 ? (
            <ExperienceSwitcher experiences={experiences} current={experience} />
          ) : null}
        </header>
        <OfflineBanner />
        <main className="flex-1 p-4">{children}</main>
      </div>
      <RegisterSw />
    </div>
  );
}
