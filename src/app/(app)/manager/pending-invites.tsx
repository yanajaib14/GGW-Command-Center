"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Dialog, EmptyState, ListRow } from "@/components/ui";
import { revokeInvitationAction } from "@/features/invitations/actions";

export type PendingInviteView = {
  invitationId: string;
  email: string;
  roleName: string;
  locationName: string;
  expiresAt: Date;
};

const GENERIC_ERROR = "Something went wrong. Try again.";

function expiry(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Phoenix",
  });
}

export function PendingInvites({
  invitations,
}: {
  invitations: PendingInviteView[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState<PendingInviteView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setTarget(null);
    setError(null);
  }

  async function revoke() {
    if (!target) return;
    const formData = new FormData();
    formData.set("invitationId", target.invitationId);
    setPending(true);
    setError(null);
    try {
      const result = await revokeInvitationAction(formData);
      if (result.ok) {
        setTarget(null);
        router.refresh();
      } else {
        setError(result.message);
      }
    } catch {
      setError(GENERIC_ERROR);
    }
    setPending(false);
  }

  if (invitations.length === 0) {
    return <EmptyState title="No open invites" body="Invites you send will wait here." />;
  }

  return (
    <>
      <div className="-mx-4 -mb-4">
        {invitations.map((inv) => (
          <ListRow
            key={inv.invitationId}
            title={inv.email}
            subtitle={`${inv.roleName} at ${inv.locationName} · expires ${expiry(inv.expiresAt)}`}
            trailing={
              <Button variant="ghost" onClick={() => setTarget(inv)}>
                Revoke
              </Button>
            }
          />
        ))}
      </div>

      <Dialog open={target !== null} onClose={close} title="Cancel this invite?">
        <div className="flex flex-col gap-4">
          <p className="text-base text-fg">
            The link for {target?.email} will stop working. You can invite them again later.
          </p>
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <div className="flex flex-col gap-2">
            <Button variant="danger" onClick={revoke} loading={pending}>
              Revoke invite
            </Button>
            <Button variant="secondary" onClick={close}>
              Keep invite
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
