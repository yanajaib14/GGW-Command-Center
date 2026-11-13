import { afterEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/server/auth/neon", () => ({ getAuth: () => ({ getSession }) }));

import { getSessionUser, sessionUserFrom } from "@/server/auth/session";

afterEach(() => {
  getSession.mockReset();
  vi.restoreAllMocks();
});

describe("sessionUserFrom", () => {
  it("reads the user from data.user, not the top level", () => {
    expect(
      sessionUserFrom({
        data: { session: {}, user: { id: "u1", email: "a@example.com", emailVerified: true } },
        error: null,
      }),
    ).toEqual({ id: "u1", email: "a@example.com", emailVerified: true });
  });

  it("lower-cases the email", () => {
    expect(
      sessionUserFrom({
        data: { session: {}, user: { id: "u1", email: "A@Example.COM", emailVerified: true } },
      }),
    ).toEqual({ id: "u1", email: "a@example.com", emailVerified: true });
  });

  it("returns null when there is no session", () => {
    expect(sessionUserFrom({ data: null, error: null })).toBeNull();
    expect(sessionUserFrom({ data: { user: null } })).toBeNull();
  });

  it("returns null when the call reported an error", () => {
    expect(
      sessionUserFrom({
        data: { session: {}, user: { id: "u1", email: "a@example.com" } },
        error: { message: "boom" },
      }),
    ).toBeNull();
  });

  it("returns null when id or email is missing", () => {
    expect(sessionUserFrom({ data: { session: {}, user: { id: "", email: "a@x.test" } } })).toBeNull();
    expect(sessionUserFrom({ data: { session: {}, user: { id: "u1", email: "" } } })).toBeNull();
  });
});

describe("sessionUserFrom emailVerified", () => {
  it("is true only when the user is marked verified", () => {
    expect(
      sessionUserFrom({
        data: { session: {}, user: { id: "u1", email: "a@x.test", emailVerified: true } },
      }),
    ).toMatchObject({ emailVerified: true });
    expect(
      sessionUserFrom({
        data: { session: {}, user: { id: "u1", email: "a@x.test", emailVerified: false } },
      }),
    ).toMatchObject({ emailVerified: false });
    expect(
      sessionUserFrom({ data: { session: {}, user: { id: "u1", email: "a@x.test" } } }),
    ).toMatchObject({ emailVerified: false });
  });
});

describe("sessionUserFrom requires a session", () => {
  it("returns null when data.session is missing", () => {
    expect(
      sessionUserFrom({ data: { user: { id: "u1", email: "a@example.com" } } }),
    ).toBeNull();
    expect(
      sessionUserFrom({
        data: { session: null, user: { id: "u1", email: "a@example.com" } },
      }),
    ).toBeNull();
  });
});

describe("getSessionUser", () => {
  it("returns the user for a valid session", async () => {
    getSession.mockResolvedValue({
      data: { session: { id: "s1" }, user: { id: "u1", email: "A@x.test", emailVerified: true } },
      error: null,
    });
    expect(await getSessionUser()).toEqual({ id: "u1", email: "a@x.test", emailVerified: true });
  });

  it("fails closed when getSession throws, logging only the error name", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new TypeError("secret-token abc for a@x.test");
    getSession.mockRejectedValue(err);
    expect(await getSessionUser()).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(spy.mock.calls[0]);
    expect(logged).toContain("TypeError");
    expect(logged).not.toContain("secret-token");
    expect(logged).not.toContain("a@x.test");
  });
});
