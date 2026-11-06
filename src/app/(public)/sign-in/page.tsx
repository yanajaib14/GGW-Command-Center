import { Card, PageHeader } from "@/components/ui";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
  const { redirectTo } = await searchParams;
  return (
    <>
      <PageHeader title="Sign in to GGW Command Center" />
      <Card>
        <SignInForm
          redirectTo={typeof redirectTo === "string" ? redirectTo : undefined}
        />
      </Card>
    </>
  );
}
