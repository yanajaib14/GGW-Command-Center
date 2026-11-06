import { afterAll } from "vitest";
import { closeTestDb } from "./db";

// Close this worker's pool so the process can exit.
afterAll(async () => {
  await closeTestDb();
});
