import { Card, PageHeader } from "@/components/ui";
import { getHubContext } from "@/features/staff/service";
import { requirePagePermission } from "@/server/auth/page-guard";
import { ProfileForm } from "./profile-form";

// Session-dependent: never prerender at build.
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const actor = await requirePagePermission("profile.edit_own", "any");
  const hub = await getHubContext(actor);
  return (
    <>
      <PageHeader title="Profile" subtitle={actor.email} />
      <Card>
        <ProfileForm displayName={actor.displayName} phone={hub.phone ?? ""} />
      </Card>
    </>
  );
}
