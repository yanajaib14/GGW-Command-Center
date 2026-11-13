import { describe, expect, it } from "vitest";
import { greetingFor } from "@/features/staff/greeting";

describe("greetingFor", () => {
  // 15:00 UTC is 08:00 in Phoenix (UTC-7, no DST).
  it("uses the location timezone, not UTC", () => {
    const t = new Date("2026-11-12T15:00:00Z");
    expect(greetingFor(t, "America/Phoenix")).toBe("Good morning");
    expect(greetingFor(t, "UTC")).toBe("Good afternoon");
  });
  it("evening after 18:00 local", () => {
    expect(greetingFor(new Date("2026-11-13T02:00:00Z"), "America/Phoenix")).toBe("Good evening");
  });
  it("falls back safely on a bad timezone", () => {
    expect(greetingFor(new Date("2026-11-12T15:00:00Z"), "Nope/Nowhere")).toBe("Good afternoon");
  });
});
