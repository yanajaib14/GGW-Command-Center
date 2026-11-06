import { redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { loadActor } from "@/server/auth/load-actor";
import { getSessionUser } from "@/server/auth/session";
import { resolveLanding } from "@/server/landing";

// Session-dependent: never prerender at build.
export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const user = await getSessionUser();
  const actor = user ? await loadActor(db, user) : null;
  redirect(resolveLanding(user, actor));
}
