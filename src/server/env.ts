import "server-only";
import { z } from "zod";

/**
 * Server environment variables, one Zod schema each. Nothing is read or
 * validated at import time: each variable is parsed when it is first accessed,
 * so `next build` and unit tests work with no environment set, and a missing
 * variable only fails the code path that needs it.
 */
const schemas = {
  DATABASE_URL: z.url(),
  NEON_AUTH_BASE_URL: z.url(),
  NEON_AUTH_COOKIE_SECRET: z.string().min(32, "must be at least 32 characters"),
  APP_URL: z.url(),
} as const;

type Schemas = typeof schemas;
export type ServerEnv = { readonly [K in keyof Schemas]: z.infer<Schemas[K]> };

function read<K extends keyof Schemas>(name: K): z.infer<Schemas[K]> {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    throw new Error(
      `${name} is not set. Add it to .env.local (see .env.example).`,
    );
  }
  const result = schemas[name].safeParse(raw);
  if (!result.success) {
    // Issue messages only: never echo the value, it may be a secret.
    const reason = result.error.issues.map((i) => i.message).join("; ");
    throw new Error(
      `${name} is invalid (${reason}). Fix it in .env.local (see .env.example).`,
    );
  }
  return result.data as z.infer<Schemas[K]>;
}

/** Lazy accessor: `serverEnv().NEON_AUTH_BASE_URL` parses that variable only. */
export function serverEnv(): ServerEnv {
  const env = {} as ServerEnv;
  for (const name of Object.keys(schemas) as (keyof Schemas)[]) {
    Object.defineProperty(env, name, {
      enumerable: true,
      get: () => read(name),
    });
  }
  return env;
}
