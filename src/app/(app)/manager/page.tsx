import {
  Badge,
  Banner,
  Card,
  EmptyState,
  ListRow,
  PageHeader,
  type BadgeTone,
} from "@/components/ui";
import {
  listInvitableLocations,
  listInvitableRoles,
  listPendingInvitations,
  listStaff,
  type EmployeeStatus,
} from "@/features/staff/service";
import { hasPermission } from "@/server/auth/actor";
import { requirePagePermission } from "@/server/auth/page-guard";
import { InviteForm, type RolesByLocation } from "./invite-form";
import { PendingInvites } from "./pending-invites";

// Session-dependent: never prerender at build.
export const dynamic = "force-dynamic";

const STATUS: Record<EmployeeStatus, { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "success" },
  invited: { label: "Invited", tone: "neutral" },
  suspended: { label: "Suspended", tone: "warning" },
  left: { label: "Left", tone: "neutral" },
};

export default async function ManagerPage() {
  const actor = await requirePagePermission("dashboard.manager", "any");
  const canView = hasPermission(actor, "staff.view", "any");
  const canInvite = hasPermission(actor, "staff.invite", "any");

  const staff = canView ? await listStaff(actor) : [];
  const pending = canInvite ? await listPendingInvitations(actor) : [];
  const locations = canInvite ? await listInvitableLocations(actor) : [];
  const rolesByLocation: RolesByLocation = {};
  for (const location of locations) {
    rolesByLocation[location.id] = (
      await listInvitableRoles(actor, location.id)
    ).map((r) => ({ id: r.id, name: r.name }));
  }

  return (
    <>
      <PageHeader title="Staff" subtitle="Your team and who you have invited." />
      <div className="flex flex-col gap-6">
        {canInvite ? (
          <Card title="Invite someone">
            <InviteForm locations={locations} rolesByLocation={rolesByLocation} />
          </Card>
        ) : (
          <Banner tone="info">You can see your team but not invite people.</Banner>
        )}

        {canInvite ? (
          <Card title="Waiting to join">
            <PendingInvites invitations={pending} />
          </Card>
        ) : null}

        <Card title="Team">
          {staff.length === 0 ? (
            <EmptyState title="No staff yet" body="People you invite will show up here." />
          ) : (
            <div className="-mx-4 -mb-4">
              {staff.map((person) => {
                const status = STATUS[person.status];
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
                  />
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
