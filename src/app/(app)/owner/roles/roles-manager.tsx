"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Card, Field, Input } from "@/components/ui";
import { createRoleAction, setRolePermissionsAction } from "@/features/roles/actions";
import { PERMISSION_GROUPS } from "@/features/roles/permission-labels";
import type { Permission } from "@/server/auth/permissions";

export type RoleView = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
};

const GENERIC_ERROR = "Something went wrong. Try again.";

function RoleCard({ role, grantable }: { role: RoleView; grantable: readonly Permission[] }) {
  const router = useRouter();
  const fixed = role.key === "owner";
  const [selected, setSelected] = useState<Set<Permission>>(new Set(role.permissions));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const unchanged =
    selected.size === role.permissions.length &&
    role.permissions.every((p) => selected.has(p));

  function toggle(permission: Permission, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(permission);
    else next.delete(permission);
    setSelected(next);
    setSaved(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("roleId", role.id);
    for (const p of selected) formData.append("permission", p);
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const result = await setRolePermissionsAction(formData);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.message);
      }
    } catch {
      setError(GENERIC_ERROR);
    }
    setPending(false);
  }

  return (
    <Card title={role.name}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {role.description ? <p className="text-base text-muted">{role.description}</p> : null}
        {fixed ? (
          <Banner tone="info">The Owner role always has every permission. It cannot be changed.</Banner>
        ) : null}
        {error ? <Banner tone="danger">{error}</Banner> : null}
        {saved ? <Banner tone="info">Saved.</Banner> : null}
        {PERMISSION_GROUPS.map((group) => (
          <fieldset key={group.title} className="flex flex-col">
            <legend className="mb-1 text-sm font-medium text-muted">{group.title}</legend>
            {group.items.map((item) => {
              const on = selected.has(item.key);
              // Cannot switch on something you do not hold; you may still switch it off.
              const locked = fixed || (!on && !grantable.includes(item.key));
              return (
                <label
                  key={item.key}
                  className="flex min-h-touch items-center gap-3 text-base text-fg"
                >
                  <input
                    type="checkbox"
                    className="size-6 shrink-0 accent-accent"
                    checked={on}
                    disabled={locked}
                    onChange={(e) => toggle(item.key, e.target.checked)}
                  />
                  <span className={locked && !on ? "text-muted" : undefined}>{item.label}</span>
                </label>
              );
            })}
          </fieldset>
        ))}
        {fixed ? null : (
          <Button type="submit" disabled={unchanged} loading={pending}>
            Save permissions
          </Button>
        )}
      </form>
    </Card>
  );
}

function CreateRole() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);
    setError(null);
    setCreated(false);
    try {
      const result = await createRoleAction(formData);
      if (result.ok) {
        setCreated(true);
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

  return (
    <Card title="Add a role">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error ? <Banner tone="danger">{error}</Banner> : null}
        {created ? (
          <Banner tone="info">Role added. Choose what it can do in its card above.</Banner>
        ) : null}
        <Field label="Name">
          <Input name="name" autoComplete="off" maxLength={60} required />
        </Field>
        <Field
          label="Key"
          hint="A short code for this role, such as shift_lead. Lower-case letters, numbers and underscores. It cannot be changed later."
        >
          <Input name="key" autoComplete="off" autoCapitalize="none" maxLength={31} required />
        </Field>
        <Field label="Description" hint="Optional.">
          <Input name="description" autoComplete="off" maxLength={200} />
        </Field>
        <Button type="submit" loading={pending}>
          Add role
        </Button>
      </form>
    </Card>
  );
}

export function RolesManager({
  roles,
  grantable,
}: {
  roles: RoleView[];
  grantable: readonly Permission[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {roles.map((role) => (
        // Remount when the saved permissions change so the form shows the stored state.
        <RoleCard
          key={`${role.id}:${role.permissions.join(",")}`}
          role={role}
          grantable={grantable}
        />
      ))}
      <CreateRole />
    </div>
  );
}
