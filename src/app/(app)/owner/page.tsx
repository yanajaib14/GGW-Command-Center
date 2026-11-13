import { Badge, Card, EmptyState, ListRow, PageHeader } from "@/components/ui";
import { listLocations } from "@/features/locations/service";
import { STATUS_LABELS } from "@/features/staff/status-labels";
import { listPendingInvitations, listStaff } from "@/features/staff/service";
import { hasPermission } from "@/server/auth/actor";
import { requirePagePermission } from "@/server/auth/page-guard";

// Session-dependent: never prerender at build.
export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex min-h-touch flex-col justify-center rounded-lg bg-surface p-4">
      <p className="text-3xl font-bold tracking-tight text-fg">{value ?? "–"}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

export default async function OwnerPage() {
  const actor = await requirePagePermission("dashboard.owner", "any");
  const canViewStaff = hasPermission(actor, "staff.view", "any");
  const canManageStaff = hasPermission(actor, "staff.manage", "any");
  const canInvite = hasPermission(actor, "staff.invite", "any");
  const canSeeLocations = hasPermission(actor, "locations.manage", "any");

  const staff = canViewStaff ? await listStaff(actor) : null;
  const pending = canInvite ? await listPendingInvitations(actor) : null;
  const locations = canSeeLocations ? await listLocations(actor) : null;

  const activeStaff = staff ? staff.filter((s) => s.status === "active").length : null;
  const openLocations = locations ? locations.filter((l) => l.status === "active").length : null;

  return (
    <>
      <PageHeader title="Overview" subtitle="How your team is set up." />
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Active staff" value={activeStaff} />
          <Stat label="Invites waiting" value={pending ? pending.length : null} />
          <Stat label="Locations" value={openLocations} />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {["Sales", "Food cost", "Labour"].map((title) => (
            <Card key={title} title={title}>
              <EmptyState title="Not connected yet" body="Connect your POS in a later phase." />
            </Card>
          ))}
        </div>

        {staff ? (
          <Card title="Team">
            {staff.length === 0 ? (
              <EmptyState title="No staff yet" body="People you invite will show up here." />
            ) : (
              <div className="-mx-4 -mb-4">
                {staff.map((person) => {
                  const status = STATUS_LABELS[person.status];
                  const roles = person.roles
                    .map((r) =>
                      r.locationName ? `${r.roleName} at ${r.locationName}` : r.roleName,
                    )
                    .join(", ");
                  return (
                    <ListRow
                      key={person.employeeId}
                      title={person.displayName}
                      subtitle={[person.email, roles].filter(Boolean).join(" · ")}
                      trailing={<Badge tone={status.tone}>{status.label}</Badge>}
                      href={canManageStaff ? `/owner/staff/${person.employeeId}` : undefined}
                    />
                  );
                })}
              </div>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
