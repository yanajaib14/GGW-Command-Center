import { describe, expect, it } from "vitest";
import { databaseIdentity, sameDatabase } from "../helpers/env";

const direct = "postgresql://u:p@ep-cool-123.us-east-2.aws.neon.tech/neondb";
const pooled = "postgresql://u:p@ep-cool-123-pooler.us-east-2.aws.neon.tech/neondb";

describe("database identity guard", () => {
  it("treats pooled and direct strings for the same endpoint as the same", () => {
    expect(sameDatabase(direct, pooled)).toBe(true);
  });

  it("treats different endpoints as different", () => {
    expect(
      sameDatabase(
        direct,
        "postgresql://u:p@ep-other-456.us-east-2.aws.neon.tech/neondb",
      ),
    ).toBe(false);
  });

  it("treats different database names as different", () => {
    expect(sameDatabase(direct, direct.replace("/neondb", "/other"))).toBe(
      false,
    );
  });

  it("ignores query parameters, credentials and case", () => {
    expect(
      sameDatabase(
        direct,
        "postgresql://x:y@EP-COOL-123-POOLER.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
      ),
    ).toBe(true);
  });

  it("only strips -pooler from the first host label", () => {
    expect(databaseIdentity("postgresql://u@a-pooler.b-pooler.c/db")).toBe(
      "a.b-pooler.c/db",
    );
  });
});
