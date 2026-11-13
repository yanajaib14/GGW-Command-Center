import { PageHeader } from "@/components/ui";
import { listAuditPage } from "@/features/audit/service";
import { requirePagePermission } from "@/server/auth/page-guard";
import { AuditList } from "./audit-list";

// Session-dependent: never prerender at build.
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const actor = await requirePagePermission("audit.view", "organization");
  const { rows, hasMore } = await listAuditPage(actor);
  return (
    <>
      <PageHeader title="Audit log" subtitle="Who changed what, newest first. This list is read-only." />
      <AuditList
        initialRows={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
        initialHasMore={hasMore}
      />
    </>
  );
}
