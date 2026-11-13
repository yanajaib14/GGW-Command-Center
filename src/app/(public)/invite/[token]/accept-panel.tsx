"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button } from "@/components/ui";
import { acceptInvitationAction } from "@/features/invitations/actions";
import { authClient } from "@/server/auth/client";

const GENERIC_ERROR = "Something went wrong. Try again.";

export function AcceptPanel({
  token,
  maskedEmail,
}: {
  token: string;
  maskedEmail: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wrongAccount, setWrongAccount] = useState(false);

  async function accept() {
    setPending(true);
    setError(null);
    try {
      const result = await acceptInvitationAction(token);
      if (result.ok) {
        router.replace("/");
        return;
      }
      if (result.code === "FORBIDDEN" && result.message === "unverified email") {
        setError("Sign in with the emailed code to accept this invitation.");
      } else if (result.code === "FORBIDDEN") setWrongAccount(true);
      else if (result.message === "unavailable") {
        setError("This invite is no longer valid. Ask for a new one.");
      } else setError(result.message);
    } catch {
      setError(GENERIC_ERROR);
    }
    setPending(false);
  }

  async function switchAccount() {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      router.replace(`/invite/${token}`);
      router.refresh();
    }
  }

  if (wrongAccount) {
    return (
      <div className="flex flex-col gap-4">
        <Banner tone="warning">This invite is for {maskedEmail}.</Banner>
        <p className="text-sm text-muted">
          Sign out, then sign in with that email address to accept it.
        </p>
        <Button variant="secondary" onClick={switchAccount} loading={signingOut}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button size="lg" onClick={accept} loading={pending}>
        Accept invite
      </Button>
    </div>
  );
}
