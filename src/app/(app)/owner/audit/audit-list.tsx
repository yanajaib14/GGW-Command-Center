"use client";

import { useState } from "react";
import { Banner, Button, Card, EmptyState, ListRow } from "@/components/ui";
import { loadMoreAuditAction, type AuditEntryView } from "@/features/audit/actions";

const GENERIC_ERROR = "Something went wrong. Try again.";

const ACTION_LABELS: Record<string, string> = {
  "setup.run": "Setup run",
  "invitation.created": "Invite created",
  "invitation.revoked": "Invite cancelled",
  "invitation.accepted": "Invite accepted",
  "role.granted": "Role added",
  "role.revoked": "Role removed",
  "role.created": "Role created",
  "role.permissions_changed": "Role permissions changed",
  "employee.status_changed": "Staff status changed",
  "employee.profile_updated": "Profile updated",
  "location.created": "Location added",
  "location.updated": "Location changed",
};

function label(action: string): string {
  return ACTION_LABELS[action] ?? action.replaceAll(".", " ").replaceAll("_", " ");
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Phoenix",
  });
}

export function AuditList({
  initialRows,
  initialHasMore,
}: {
  initialRows: AuditEntryView[];
  initialHasMore: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    const last = rows[rows.length - 1];
    if (!last) return;
    setPending(true);
    setError(null);
    try {
      const result = await loadMoreAuditAction(last.createdAt, last.id);
      if (result.ok) {
        setRows((current) => [...current, ...result.rows]);
        setHasMore(result.hasMore);
      } else {
        setError(result.message);
      }
    } catch {
      setError(GENERIC_ERROR);
    }
    setPending(false);
  }

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState title="Nothing yet" body="Changes to staff, roles and locations will be listed here." />
      </Card>
    );
  }

  return (
    <Card>
      <div className="-mx-4 -my-3">
        {rows.map((r) => (
          <ListRow
            key={r.id}
            title={label(r.action)}
            subtitle={[
              r.actorName ?? "System",
              when(r.createdAt),
              r.locationName,
              r.entityId ? `${r.entityType} ${r.entityId.slice(0, 8)}` : r.entityType,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        ))}
      </div>
      {error ? (
        <div className="mt-3">
          <Banner tone="danger">{error}</Banner>
        </div>
      ) : null}
      {hasMore ? (
        <div className="mt-3 flex flex-col">
          <Button variant="secondary" onClick={loadMore} loading={pending}>
            Load more
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
