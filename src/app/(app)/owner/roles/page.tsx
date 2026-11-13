import { PageHeader } from "@/components/ui";
import { listRoles } from "@/features/roles/service";
import { hasPermission } from "@/server/auth/actor";
import { requirePagePermission } from "@/server/auth/page-guard";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";
import { RolesManager } from "./roles-manager";

// Session-dependent: never prerender at build.
export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const actor = await requirePagePermission("roles.manage", "organization");
  const roles = await listRoles(actor);
  // You can only switch ON what you hold yourself; the server enforces it too.
  const grantable: Permission[] = PERMISSIONS.filter((p) =>
    hasPermission(actor, p, "organization"),
  );
  return (
    <>
      <PageHeader
        title="Roles"
        subtitle="What each role can do. Changes apply the next time someone opens the app."
      />
      <RolesManager roles={roles} grantable={grantable} />
    </>
  );
}
