// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OfflineBanner } from "@/components/shell/offline-banner";

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

afterEach(() => {
  cleanup();
  setOnline(true);
});

describe("OfflineBanner", () => {
  it("hidden when online", () => {
    setOnline(true);
    render(<OfflineBanner />);
    expect(screen.queryByText("You're offline")).toBeNull();
  });

  it("shows the banner after an offline event", () => {
    setOnline(true);
    render(<OfflineBanner />);
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText("You're offline")).toBeInTheDocument();
  });

  it("hides again after online", () => {
    setOnline(true);
    render(<OfflineBanner />);
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText("You're offline")).toBeNull();
  });

  it("shows immediately when mounted offline", () => {
    setOnline(false);
    render(<OfflineBanner />);
    expect(screen.getByText("You're offline")).toBeInTheDocument();
  });
});
