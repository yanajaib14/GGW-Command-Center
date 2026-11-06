import Link from "next/link";
import { cn } from "@/lib/cn";
import { focusRing } from "@/components/ui/focus";
import { experiencePath, type Experience } from "@/server/nav";

const LABELS: Record<Experience, string> = {
  owner: "Owner",
  manager: "Manager",
  employee: "Employee",
};

export function ExperienceSwitcher({
  experiences,
  current,
}: {
  experiences: readonly Experience[];
  current: Experience;
}) {
  return (
    <nav aria-label="Experience" className="flex gap-1">
      {experiences.map((e) => (
        <Link
          key={e}
          href={experiencePath(e)}
          aria-current={e === current ? "page" : undefined}
          className={cn(
            "inline-flex min-h-touch items-center rounded-md border px-3 text-sm",
            focusRing,
            e === current
              ? "border-accent bg-accent text-accent-fg"
              : "border-line bg-surface text-fg",
          )}
        >
          {LABELS[e]}
        </Link>
      ))}
    </nav>
  );
}
