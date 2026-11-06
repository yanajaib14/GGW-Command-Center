"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/server/auth/client";

const GENERIC_ERROR = "Something went wrong. Try again.";

const BASE = "http://ggw.local";

function safeRedirect(value: string | undefined): string {
  if (!value || /[\u0000-\u001f\u007f\\]/.test(value)) return "/";
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE || url.pathname.startsWith("//")) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
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
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState("");
  const [moved, setMoved] = useState(false);

  async function sendCode(setBusy: (v: boolean) => void): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    setBusy(true);
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
      setBusy(false);
    }
  }

  async function onEmailSubmit(e: FormEvent) {
    e.preventDefault();
    if (await sendCode(setPending)) {
      setCode("");
      setMoved(true);
      setNotice("We sent a code.");
      setStep("code");
    }
  }

  async function onResend() {
    setNotice("");
    if (await sendCode(setResending)) {
      setCode("");
      setNotice("We sent a new code.");
    }
  }

  async function onCodeSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { error: err } = await authClient.signIn.emailOtp({
        email,
        otp: code.replace(/\s+/g, ""),
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

  const status = (
    <p
      role="status"
      aria-live="polite"
      className="text-sm text-muted empty:hidden"
    >
      {notice}
    </p>
  );

  if (step === "email") {
    return (
      <>
        {status}
        <form
          key="email"
          onSubmit={onEmailSubmit}
          className="flex flex-col gap-4"
        >
          <Field label="Email" hint="We'll email you a 6-digit code.">
            <Input
              type="email"
              autoComplete="email"
              inputMode="email"
              autoFocus={moved}
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
      </>
    );
  }

  return (
    <>
      {status}
      <form key="code" onSubmit={onCodeSubmit} className="flex flex-col gap-4">
        <Field label="Code" hint={`Enter the code we sent to ${email}.`}>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
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
          <Button
            variant="ghost"
            loading={resending}
            disabled={pending}
            onClick={() => void onResend()}
          >
            Send a new code
          </Button>
          <Button
            variant="ghost"
            disabled={pending || resending}
            onClick={() => {
              setError(null);
              setNotice("");
              setStep("email");
            }}
          >
            Use a different email
          </Button>
        </div>
      </form>
    </>
  );
}
