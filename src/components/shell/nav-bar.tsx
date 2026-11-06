"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { focusRing } from "@/components/ui/focus";
import { activeHref, type NavItem } from "@/server/nav";
import { NavIcon } from "./icons";

/** Bottom tab bar below `md`, left sidebar column at `md` and above. */
export function NavBar({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  const active = activeHref(items, pathname);

  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]",
        "md:static md:inset-auto md:w-56 md:shrink-0 md:border-t-0 md:border-r md:pb-0",
      )}
    >
      <ul className="flex md:flex-col md:gap-1 md:p-3">
        {items.map((item) => {
          const current = item.href === active;
          return (
            <li key={item.href} className="flex-1 md:flex-none">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-touch min-w-touch flex-col items-center justify-center gap-1 px-2 py-1 text-sm",
                  "md:flex-row md:justify-start md:gap-3 md:rounded-md md:px-3 md:text-base",
                  focusRing,
                  current ? "bg-accent/15 font-semibold text-accent" : "text-muted",
                )}
              >
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
