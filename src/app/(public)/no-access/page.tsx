import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { getSessionUser } from "@/server/auth/session";
import { SignOutButton } from "./sign-out-button";

// Session-dependent: never prerender at build.
export const dynamic = "force-dynamic";

export default async function NoAccessPage() {
  if (!(await getSessionUser())) redirect("/sign-in");
  return (
    <>
      <PageHeader title="You don't have access yet" />
      <Card>
        <div className="flex flex-col gap-4">
          <p>Ask a manager to send you an invite.</p>
          <SignOutButton />
        </div>
      </Card>
    </>
  );
}
