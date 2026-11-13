"use server";

import { AppError } from "@/server/auth/errors";
import { requirePermission } from "@/server/auth/require";
import { listAuditPage } from "./service";

export type AuditEntryView = {
  id: string;
  createdAt: string;
  action: string;
  actorName: string | null;
  entityType: string;
  entityId: string | null;
  locationName: string | null;
};

export type LoadMoreResult =
  | { ok: true; rows: AuditEntryView[]; hasMore: boolean }
  | { ok: false; message: string };

/** Next page after the cursor (created-at ISO string and row id of the last row shown). */
export async function loadMoreAuditAction(
  beforeCreatedAt: string,
  beforeId: string,
): Promise<LoadMoreResult> {
  try {
    const actor = await requirePermission("audit.view", "organization");
    const at = new Date(beforeCreatedAt);
    if (Number.isNaN(at.getTime()) || typeof beforeId !== "string") {
      return { ok: false, message: "Something went wrong. Try again." };
    }
    const page = await listAuditPage(actor, { createdAt: at, id: beforeId });
    return {
      ok: true,
      hasMore: page.hasMore,
      rows: page.rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    console.error(
      "audit action failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return { ok: false, message: "Something went wrong. Try again." };
  }
}
