"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/server/auth/client";

const GENERIC_ERROR = "Something went wrong. Try again.";

function safeRedirect(value: string | undefined): string {
  if (
    value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/\\")
  ) {
    return value;
  }
  return "/";
}

function messageOf(error: { message?: string } | null | undefined): string {
  return error?.message || GENERIC_ERROR;
}

export function SignInForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function sendCode(): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    setPending(true);
    setError(null);
    try {
      const { error: err } = await authClient.emailOtp.sendVerificationOtp({
        email: normalized,
        type: "sign-in",
      });
      if (err) {
        setError(messageOf(err));
        return false;
      }
      setEmail(normalized);
      return true;
    } catch {
      setError(GENERIC_ERROR);
      return false;
    } finally {
      setPending(false);
    }
  }

  async function onEmailSubmit(e: FormEvent) {
    e.preventDefault();
    if (await sendCode()) {
      setCode("");
      setStep("code");
    }
  }

  async function onCodeSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { error: err } = await authClient.signIn.emailOtp({
        email,
        otp: code.trim(),
      });
      if (err) {
        setError(messageOf(err));
        setPending(false);
        return;
      }
      router.replace(safeRedirect(redirectTo));
    } catch {
      setError(GENERIC_ERROR);
      setPending(false);
    }
  }

  if (step === "email") {
    return (
      <form onSubmit={onEmailSubmit} className="flex flex-col gap-4">
        <Field label="Email" hint="We'll email you a 6-digit code.">
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Button type="submit" size="lg" loading={pending}>
          Send code
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onCodeSubmit} className="flex flex-col gap-4">
      <Field label="Code" hint={`Enter the code we sent to ${email}.`}>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button type="submit" size="lg" loading={pending}>
        Sign in
      </Button>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" disabled={pending} onClick={() => void sendCode()}>
          Send a new code
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setError(null);
            setStep("email");
          }}
        >
          Use a different email
        </Button>
      </div>
    </form>
  );
}
