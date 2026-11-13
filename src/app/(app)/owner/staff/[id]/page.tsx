import { notFound } from "next/navigation";
import { Badge, Card, ListRow, PageHeader } from "@/components/ui";
import {
  getStaffDetail,
  listGrantableRoles,
  listManageableLocations,
} from "@/features/staff/service";
import { STATUS_LABELS } from "@/features/staff/status-labels";
import { hasPermission } from "@/server/auth/actor";
import { NotFound } from "@/server/auth/errors";
import { requirePagePermission } from "@/server/auth/page-guard";
import { StaffManage, type GrantOptions } from "./staff-manage";

// Session-dependent: never prerender at build.
export const dynamic = "force-dynamic";

export default async function StaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePagePermission("staff.manage", "any");
  const { id } = await params;

  let detail;
  try {
    detail = await getStaffDetail(actor, id);
  } catch (error) {
    if (error instanceof NotFound) notFound();
    throw error;
  }

  // Roles the actor could grant, per place: "all" means every location.
  const grant: GrantOptions = { places: [], rolesByPlace: {} };
  if (!detail.isSelf && (detail.status === "active" || detail.status === "suspended")) {
    if (hasPermission(actor, "staff.manage", "organization")) {
      grant.places.push({ key: "all", name: "All locations" });
      grant.rolesByPlace.all = await listGrantableRoles(actor, null);
    }
    for (const location of await listManageableLocations(actor)) {
      grant.places.push({ key: location.id, name: location.name });
      grant.rolesByPlace[location.id] = await listGrantableRoles(actor, location.id);
    }
  }

  const status = STATUS_LABELS[detail.status];
  return (
    <>
      <PageHeader
        title={detail.displayName}
        subtitle={[detail.email, detail.phone].filter(Boolean).join(" · ")}
        actions={<Badge tone={status.tone}>{status.label}</Badge>}
      />
      <div className="flex flex-col gap-6">
        <StaffManage
          employeeId={detail.employeeId}
          name={detail.displayName}
          status={detail.status}
          isSelf={detail.isSelf}
          assignments={detail.assignments.map((a) => ({
            assignmentId: a.assignmentId,
            roleName: a.roleName,
            locationName: a.locationName,
          }))}
          grant={grant}
        />
        <Card>
          <div className="-mx-4 -my-3">
            <ListRow title="Back to overview" href="/owner" />
          </div>
        </Card>
      </div>
    </>
  );
}
