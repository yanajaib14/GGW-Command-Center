"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { authClient } from "@/server/auth/client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await authClient.signOut();
    } finally {
      router.replace("/sign-in");
    }
  }

  return (
    <Button variant="secondary" onClick={signOut} loading={busy}>
      Sign out
    </Button>
  );
}
