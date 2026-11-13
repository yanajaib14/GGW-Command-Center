"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Dialog, Field, Input, Select } from "@/components/ui";
import { createInvitationAction } from "@/features/invitations/actions";

export type RolesByLocation = Record<string, Array<{ id: string; name: string }>>;

type Created = { name: string; inviteUrl: string };

const GENERIC_ERROR = "Something went wrong. Try again.";

export function InviteForm({
  locations,
  rolesByLocation,
}: {
  locations: Array<{ id: string; name: string }>;
  rolesByLocation: RolesByLocation;
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  const roles = rolesByLocation[locationId] ?? [];

  if (locations.length === 0 || roles.length === 0) {
    return <Banner tone="info">There is no one you can invite right now.</Banner>;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);
    setError(null);
    try {
      const result = await createInvitationAction(formData);
      if (result.ok) {
        const first = String(formData.get("firstName") ?? "").trim();
        setCreated({ name: first || "them", inviteUrl: result.inviteUrl });
        setCopied(false);
        form.reset();
        router.refresh();
      } else {
        setError(result.message);
      }
    } catch {
      setError(GENERIC_ERROR);
    }
    setPending(false);
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Field label="First name">
          <Input name="firstName" autoComplete="off" required />
        </Field>
        <Field label="Last name">
          <Input name="lastName" autoComplete="off" required />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" autoComplete="off" required />
        </Field>
        {locations.length > 1 ? (
          <Field label="Location">
            <Select
              name="locationId"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="locationId" value={locationId} />
        )}
        <Field label="Role">
          <Select name="roleId" key={locationId} defaultValue={roles[0]?.id}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" loading={pending}>
          Create invite link
        </Button>
      </form>

      <Dialog
        open={created !== null}
        onClose={() => setCreated(null)}
        title="Invite link ready"
      >
        {created ? (
          <div className="flex flex-col gap-4">
            <p className="text-base text-fg">
              Send this link to {created.name} by text or email. It expires in 7 days.
            </p>
            <Input
              readOnly
              value={created.inviteUrl}
              aria-label="Invite link"
              onFocus={(e) => e.currentTarget.select()}
            />
            {copied ? <Banner tone="info">Link copied.</Banner> : null}
            <div className="flex flex-col gap-2">
              <Button onClick={copy}>Copy link</Button>
              <Button variant="secondary" onClick={() => setCreated(null)}>
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
