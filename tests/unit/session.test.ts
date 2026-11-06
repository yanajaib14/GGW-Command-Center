import { describe, expect, it } from "vitest";
import { sessionUserFrom } from "@/server/auth/session";

describe("sessionUserFrom", () => {
  it("reads the user from data.user, not the top level", () => {
    expect(
      sessionUserFrom({
        data: { user: { id: "u1", email: "a@example.com" } },
        error: null,
      }),
    ).toEqual({ id: "u1", email: "a@example.com" });
  });

  it("lower-cases the email", () => {
    expect(
      sessionUserFrom({ data: { user: { id: "u1", email: "A@Example.COM" } } }),
    ).toEqual({ id: "u1", email: "a@example.com" });
  });

  it("returns null when there is no session", () => {
    expect(sessionUserFrom({ data: null, error: null })).toBeNull();
    expect(sessionUserFrom({ data: { user: null } })).toBeNull();
  });

  it("returns null when the call reported an error", () => {
    expect(
      sessionUserFrom({
        data: { user: { id: "u1", email: "a@example.com" } },
        error: { message: "boom" },
      }),
    ).toBeNull();
  });

  it("returns null when id or email is missing", () => {
    expect(sessionUserFrom({ data: { user: { id: "", email: "a@x.test" } } })).toBeNull();
    expect(sessionUserFrom({ data: { user: { id: "u1", email: "" } } })).toBeNull();
  });
});
