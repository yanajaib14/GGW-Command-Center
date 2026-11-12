/**
 * One-time bootstrap. Creates the organization, first location, system roles
 * and an Owner invitation, then prints the Owner's invite link.
 *
 *   npm run setup:owner -- --org "Glai Gung Won" --slug ggw \
 *     --location "..." --email owner@example.com --first Ada --last Lovelace
 *
 * Reads DATABASE_URL and APP_URL from the environment (.env.local is loaded
 * when present). Use the direct (non-pooler) Neon URL.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

async function main(): Promise<number> {
  const envFile = resolve(process.cwd(), ".env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  // Imported after the env file is loaded; the DB client reads env lazily anyway.
  const { AppError } = await import("@/server/auth/errors");
  const { runOwnerSetup } = await import("@/features/setup/service");

  const { values } = parseArgs({
    options: {
      org: { type: "string" },
      slug: { type: "string" },
      location: { type: "string" },
      email: { type: "string" },
      first: { type: "string" },
      last: { type: "string" },
    },
    strict: true,
  });

  const { org, slug, location, email, first, last } = values;
  if (!org || !slug || !location || !email || !first || !last) {
    console.error(
      'Usage: npm run setup:owner -- --org "Name" --slug ggw --location "Name" --email a@b.com --first Ada --last Lovelace (all six flags are required)',
    );
    return 1;
  }

  try {
    const { inviteUrl } = await runOwnerSetup({
      organizationName: org,
      slug,
      locationName: location,
      ownerEmail: email,
      ownerFirstName: first,
      ownerLastName: last,
    });
    console.log("Setup complete. Open this link to accept the Owner invitation (valid 7 days):");
    console.log(inviteUrl);
    return 0;
  } catch (error) {
    if (error instanceof AppError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : "Setup failed.");
    process.exit(1);
  },
);
