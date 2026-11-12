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
    <nav aria-label="Experience" className="flex gap-0.5 rounded-md bg-fg/[0.08] p-0.5">
      {experiences.map((e) => (
        <Link
          key={e}
          href={experiencePath(e)}
          aria-current={e === current ? "page" : undefined}
          className={cn(
            "inline-flex min-h-touch items-center rounded-sm px-3 text-sm font-medium transition-colors duration-150 ease-out",
            focusRing,
            e === current
              ? "bg-accent text-accent-fg"
              : "text-fg hover:bg-fg/[0.06]",
          )}
        >
          {LABELS[e]}
        </Link>
      ))}
    </nav>
  );
}
