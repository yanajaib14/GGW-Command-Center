"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Card, Dialog, EmptyState, Field, ListRow, Select } from "@/components/ui";
import {
  grantRoleAction,
  revokeRoleAction,
  setEmployeeStatusAction,
} from "@/features/staff/actions";

type ManagedStatus = "active" | "suspended" | "left";

export type GrantOptions = {
  /** `key` is a location id, or "all" for every location. */
  places: Array<{ key: string; name: string }>;
  rolesByPlace: Record<string, Array<{ id: string; name: string }>>;
};

type AssignmentView = {
  assignmentId: string;
  roleName: string;
  locationName: string | null;
};

const GENERIC_ERROR = "Something went wrong. Try again.";

const STATUS_CHOICES: Array<{ value: ManagedStatus; label: string }> = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "left", label: "Left the team" },
];

type Confirm =
  | { kind: "status"; status: "suspended" | "left" }
  | { kind: "revoke"; assignment: AssignmentView };

export function StaffManage({
  employeeId,
  name,
  status,
  isSelf,
  assignments,
  grant,
}: {
  employeeId: string;
  name: string;
  status: "invited" | "active" | "suspended" | "left";
  isSelf: boolean;
  assignments: AssignmentView[];
  grant: GrantOptions;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<ManagedStatus>(
    status === "suspended" ? "suspended" : "active",
  );
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [placeKey, setPlaceKey] = useState(grant.places[0]?.key ?? "");

  const canEditStatus = !isSelf && (status === "active" || status === "suspended");
  const canEditRoles = !isSelf && (status === "active" || status === "suspended");
  const grantRoles = grant.rolesByPlace[placeKey] ?? [];

  function closeConfirm() {
    setConfirm(null);
    setError(null);
  }

  /** Run an action; on success refresh the page, otherwise show its message. */
  async function run(
    action: (formData: FormData) => Promise<{ ok: true } | { ok: false; message: string }>,
    formData: FormData,
    done: string,
  ): Promise<boolean> {
    setPending(true);
    setError(null);
    setNotice(null);
    let ok = false;
    try {
      const result = await action(formData);
      if (result.ok) {
        ok = true;
        setNotice(done);
        router.refresh();
      } else {
        setError(result.message);
      }
    } catch {
      setError(GENERIC_ERROR);
    }
    setPending(false);
    return ok;
  }

  async function saveStatus(next: ManagedStatus) {
    const formData = new FormData();
    formData.set("employeeId", employeeId);
    formData.set("status", next);
    const ok = await run(setEmployeeStatusAction, formData, "Status saved.");
    if (ok) setConfirm(null);
  }

  function onStatusSubmit(event: FormEvent) {
    event.preventDefault();
    if (chosen === status) return;
    if (chosen === "active") void saveStatus("active");
    else setConfirm({ kind: "status", status: chosen });
  }

  async function revoke(assignment: AssignmentView) {
    const formData = new FormData();
    formData.set("assignmentId", assignment.assignmentId);
    const ok = await run(revokeRoleAction, formData, "Role removed.");
    if (ok) setConfirm(null);
  }

  async function onGrantSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("employeeId", employeeId);
    formData.set("locationId", placeKey);
    await run(grantRoleAction, formData, "Role added.");
  }

  return (
    <>
      {isSelf ? (
        <Banner tone="info">This is you. You cannot change your own access or status.</Banner>
      ) : null}
      {status === "invited" ? (
        <Banner tone="info">
          {name} has not joined yet. Their invite sets their role. Cancel it from the Manager
          screen if you need to.
        </Banner>
      ) : null}
      {status === "left" ? (
        <Banner tone="info">
          {name} has left the team. Invite them again to bring them back.
        </Banner>
      ) : null}
      {error && !confirm ? <Banner tone="danger">{error}</Banner> : null}
      {notice ? <Banner tone="info">{notice}</Banner> : null}

      {canEditStatus ? (
        <Card title="Status">
          <form onSubmit={onStatusSubmit} className="flex flex-col gap-4">
            <Field
              label="Status"
              hint="Suspended people are signed out of everything the next time they open the app."
            >
              <Select
                value={chosen}
                onChange={(e) => setChosen(e.target.value as ManagedStatus)}
              >
                {STATUS_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={chosen === status} loading={pending && !confirm}>
              Save status
            </Button>
          </form>
        </Card>
      ) : null}

      <Card title="Roles">
        {assignments.length === 0 ? (
          <EmptyState title="No roles" body="This person has no access right now." />
        ) : (
          <div className="-mx-4 -mb-4">
            {assignments.map((a) => (
              <ListRow
                key={a.assignmentId}
                title={a.roleName}
                subtitle={a.locationName ?? "All locations"}
                trailing={
                  canEditRoles ? (
                    <Button
                      variant="ghost"
                      onClick={() => setConfirm({ kind: "revoke", assignment: a })}
                    >
                      Remove
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </Card>

      {canEditRoles ? (
        <Card title="Add a role">
          {grant.places.length === 0 ? (
            <Banner tone="info">There is no role you can add for this person.</Banner>
          ) : (
            <form onSubmit={onGrantSubmit} className="flex flex-col gap-4">
              <Field label="Where">
                <Select value={placeKey} onChange={(e) => setPlaceKey(e.target.value)}>
                  {grant.places.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {grantRoles.length === 0 ? (
                <Banner tone="info">There is no role you can add there.</Banner>
              ) : (
                <>
                  <Field label="Role">
                    <Select name="roleId" key={placeKey} defaultValue={grantRoles[0]?.id}>
                      {grantRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button type="submit" loading={pending && !confirm}>
                    Add role
                  </Button>
                </>
              )}
            </form>
          )}
        </Card>
      ) : null}

      <Dialog
        open={confirm?.kind === "status"}
        onClose={closeConfirm}
        title={confirm?.kind === "status" && confirm.status === "left" ? `Mark ${name} as left?` : `Suspend ${name}?`}
      >
        <div className="flex flex-col gap-4">
          <p className="text-base text-fg">
            {confirm?.kind === "status" && confirm.status === "left"
              ? "Their roles will end and they will lose access. To bring them back you would invite them again."
              : "They lose access the next time they open the app. You can turn their access back on later."}
          </p>
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <div className="flex flex-col gap-2">
            <Button
              variant="danger"
              loading={pending}
              onClick={() => confirm?.kind === "status" && saveStatus(confirm.status)}
            >
              {confirm?.kind === "status" && confirm.status === "left"
                ? "Mark as left"
                : "Suspend"}
            </Button>
            <Button variant="secondary" onClick={closeConfirm}>
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={confirm?.kind === "revoke"}
        onClose={closeConfirm}
        title="Remove this role?"
      >
        <div className="flex flex-col gap-4">
          <p className="text-base text-fg">
            {confirm?.kind === "revoke"
              ? `${name} will no longer be ${confirm.assignment.roleName} at ${confirm.assignment.locationName ?? "all locations"}. You can add it again later.`
              : null}
          </p>
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <div className="flex flex-col gap-2">
            <Button
              variant="danger"
              loading={pending}
              onClick={() => confirm?.kind === "revoke" && revoke(confirm.assignment)}
            >
              Remove role
            </Button>
            <Button variant="secondary" onClick={closeConfirm}>
              Keep role
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
