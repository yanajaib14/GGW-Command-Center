"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Field, Input } from "@/components/ui";
import { updateOwnProfileAction } from "@/features/staff/actions";

const GENERIC_ERROR = "Something went wrong. Try again.";

export function ProfileForm({
  displayName,
  phone,
}: {
  displayName: string;
  phone: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const result = await updateOwnProfileAction(formData);
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {saved ? <Banner tone="info">Your profile is saved.</Banner> : null}
      <Field label="Name">
        <Input
          name="displayName"
          defaultValue={displayName}
          autoComplete="name"
          maxLength={60}
          required
        />
      </Field>
      <Field label="Phone" hint="Optional. Digits, spaces and + ( ) - only.">
        <Input
          name="phone"
          type="tel"
          defaultValue={phone}
          autoComplete="tel"
          maxLength={20}
        />
      </Field>
      <Button type="submit" loading={pending}>
        Save
      </Button>
    </form>
  );
}
