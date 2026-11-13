import { redirect } from "next/navigation";
import { Banner, Card, PageHeader } from "@/components/ui";
import {
  getInvitationPreview,
  hasAcceptedInvitation,
  type InvitationStatus,
} from "@/features/invitations/service";
import { getSessionUser } from "@/server/auth/session";
import { SignInForm } from "../../sign-in/sign-in-form";
import { AcceptPanel } from "./accept-panel";

// Session-dependent: never prerender at build.
export const dynamic = "force-dynamic";

const PROBLEM: Record<Exclude<InvitationStatus, "valid">, string> = {
  expired: "This invite has expired. Ask for a new one.",
  revoked: "This invite was cancelled. Ask for a new one.",
  accepted: "This invite has already been used.",
  unknown: "We could not find this invite. Check the link or ask for a new one.",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [preview, user] = await Promise.all([
    getInvitationPreview(token),
    getSessionUser(),
  ]);

  if (preview.status === "accepted" && user) {
    if (await hasAcceptedInvitation(user, token)) redirect("/");
  }

  if (preview.status !== "valid") {
    return (
      <>
        <PageHeader title="Invitation" />
        <Banner tone="warning">{PROBLEM[preview.status]}</Banner>
      </>
    );
  }

  const where = preview.locationName ? ` at ${preview.locationName}` : "";
  return (
    <>
      <PageHeader title="You're invited" />
      <Card>
        <div className="flex flex-col gap-4">
          <p>
            You&apos;re invited to {preview.organizationName} as{" "}
            {preview.roleName}
            {where}.
          </p>
          {user ? (
            <AcceptPanel token={token} maskedEmail={preview.maskedEmail ?? ""} />
          ) : (
            <>
              <p className="text-sm text-muted">
                Sign in with {preview.maskedEmail} to accept.
              </p>
              <SignInForm redirectTo={`/invite/${token}`} />
            </>
          )}
        </div>
      </Card>
    </>
  );
}
