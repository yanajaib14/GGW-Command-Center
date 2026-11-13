"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Banner,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  ListRow,
  Select,
} from "@/components/ui";
import { createLocationAction, updateLocationAction } from "@/features/locations/actions";

export type LocationView = {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  status: "active" | "closed";
};

const GENERIC_ERROR = "Something went wrong. Try again.";
const DEFAULT_TIMEZONE = "America/Phoenix";

function TimezoneSelect({
  timezones,
  defaultValue,
}: {
  timezones: string[];
  defaultValue: string;
}) {
  return (
    <Select name="timezone" defaultValue={defaultValue}>
      {timezones.map((tz) => (
        <option key={tz} value={tz}>
          {tz.replaceAll("_", " ")}
        </option>
      ))}
    </Select>
  );
}

function CreateLocation({ timezones }: { timezones: string[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);
    setError(null);
    setAdded(false);
    try {
      const result = await createLocationAction(formData);
      if (result.ok) {
        setAdded(true);
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
    <Card title="Add a location">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error ? <Banner tone="danger">{error}</Banner> : null}
        {added ? <Banner tone="info">Location added.</Banner> : null}
        <Field label="Name">
          <Input name="name" autoComplete="off" maxLength={80} required />
        </Field>
        <Field label="Address" hint="Optional.">
          <Input name="address" autoComplete="off" maxLength={200} />
        </Field>
        <Field label="Time zone">
          <TimezoneSelect timezones={timezones} defaultValue={DEFAULT_TIMEZONE} />
        </Field>
        <Button type="submit" loading={pending}>
          Add location
        </Button>
      </form>
    </Card>
  );
}

function EditDialog({
  location,
  timezones,
  canChangeStatus,
  onClose,
}: {
  location: LocationView | null;
  timezones: string[];
  canChangeStatus: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);

  function close() {
    setError(null);
    setConfirmingClose(false);
    onClose();
  }

  async function send(formData: FormData): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const result = await updateLocationAction(formData);
      if (result.ok) {
        close();
        router.refresh();
      } else {
        setError(result.message);
      }
    } catch {
      setError(GENERIC_ERROR);
    }
    setPending(false);
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!location) return;
    const formData = new FormData(event.currentTarget);
    formData.set("locationId", location.id);
    await send(formData);
  }

  async function setStatus(status: "active" | "closed") {
    if (!location) return;
    const formData = new FormData();
    formData.set("locationId", location.id);
    formData.set("status", status);
    await send(formData);
  }

  return (
    <Dialog
      open={location !== null}
      onClose={close}
      title={confirmingClose ? "Close this location?" : "Edit location"}
    >
      {location ? (
        confirmingClose ? (
          <div className="flex flex-col gap-4">
            <p className="text-base text-fg">
              {location.name} will stop giving anyone access while it is closed. Nothing is
              deleted, and you can reopen it later.
            </p>
            {error ? <Banner tone="danger">{error}</Banner> : null}
            <div className="flex flex-col gap-2">
              <Button variant="danger" loading={pending} onClick={() => setStatus("closed")}>
                Close location
              </Button>
              <Button variant="secondary" onClick={() => setConfirmingClose(false)}>
                Keep it open
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <form onSubmit={onSave} className="flex flex-col gap-4">
              {error ? <Banner tone="danger">{error}</Banner> : null}
              <Field label="Name">
                <Input name="name" defaultValue={location.name} maxLength={80} required />
              </Field>
              <Field label="Address" hint="Optional.">
                <Input name="address" defaultValue={location.address ?? ""} maxLength={200} />
              </Field>
              <Field label="Time zone">
                <TimezoneSelect timezones={timezones} defaultValue={location.timezone} />
              </Field>
              <Button type="submit" loading={pending}>
                Save
              </Button>
            </form>
            {canChangeStatus ? (
              location.status === "active" ? (
                <Button variant="secondary" onClick={() => setConfirmingClose(true)}>
                  Close this location
                </Button>
              ) : (
                <Button variant="secondary" loading={pending} onClick={() => setStatus("active")}>
                  Reopen this location
                </Button>
              )
            ) : null}
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        )
      ) : null}
    </Dialog>
  );
}

export function LocationsManager({
  locations,
  timezones,
  canCreate,
  canChangeStatus,
}: {
  locations: LocationView[];
  timezones: string[];
  canCreate: boolean;
  canChangeStatus: boolean;
}) {
  const [editing, setEditing] = useState<LocationView | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <Card title="Your locations">
        {locations.length === 0 ? (
          <EmptyState title="No locations" body="Add your first location below." />
        ) : (
          <div className="-mx-4 -mb-4">
            {locations.map((l) => (
              <ListRow
                key={l.id}
                title={l.name}
                subtitle={[l.address, l.timezone.replaceAll("_", " ")].filter(Boolean).join(" · ")}
                trailing={
                  <>
                    <Badge tone={l.status === "active" ? "success" : "neutral"}>
                      {l.status === "active" ? "Open" : "Closed"}
                    </Badge>
                    <Button variant="ghost" onClick={() => setEditing(l)}>
                      Edit
                    </Button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </Card>
      {canCreate ? <CreateLocation timezones={timezones} /> : null}
      <EditDialog
        // Fresh form state for each location opened.
        key={editing?.id ?? "none"}
        location={editing}
        timezones={timezones}
        canChangeStatus={canChangeStatus}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
