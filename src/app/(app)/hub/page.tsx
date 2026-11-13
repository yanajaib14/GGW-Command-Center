import { Card, EmptyState, PageHeader } from "@/components/ui";
import { greetingFor } from "@/features/staff/greeting";
import { getHubContext } from "@/features/staff/service";
import { requirePagePermission } from "@/server/auth/page-guard";

// Session-dependent: never prerender at build.
export const dynamic = "force-dynamic";

const SOON = ["Checklists", "Prep", "Notes"] as const;

export default async function HubPage() {
  const actor = await requirePagePermission("dashboard.employee", "any");
  const hub = await getHubContext(actor);
  return (
    <>
      <PageHeader
        title={`${greetingFor(new Date(), hub.timezone)}, ${actor.displayName}`}
        subtitle={hub.locationName ?? undefined}
      />
      <div className="flex flex-col gap-4">
        {SOON.map((title) => (
          <Card key={title}>
            <EmptyState title={title} body="Coming soon" />
          </Card>
        ))}
      </div>
    </>
  );
}
