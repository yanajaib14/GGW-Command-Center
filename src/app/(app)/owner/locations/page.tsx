import { PageHeader } from "@/components/ui";
import { listLocations, supportedTimezones } from "@/features/locations/service";
import { hasPermission } from "@/server/auth/actor";
import { requirePagePermission } from "@/server/auth/page-guard";
import { LocationsManager } from "./locations-manager";

// Session-dependent: never prerender at build.
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const actor = await requirePagePermission("locations.manage", "any");
  const locations = await listLocations(actor);
  const orgWide = hasPermission(actor, "locations.manage", "organization");
  return (
    <>
      <PageHeader title="Locations" subtitle="Your restaurants and their time zones." />
      <LocationsManager
        locations={locations}
        timezones={supportedTimezones()}
        canCreate={orgWide}
        canChangeStatus={orgWide}
      />
    </>
  );
}
