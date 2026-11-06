// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/owner/roles" }));

import { AppShell } from "@/components/shell/app-shell";
import {
  DEFAULT_ROLE_PERMISSIONS,
  type Permission,
} from "@/server/auth/permissions";
import type { Actor } from "@/server/auth/actor";

function actorWith(permissions: readonly Permission[]): Actor {
  return {
    employeeId: "e1",
    organizationId: "o1",
    email: "a@example.com",
    displayName: "Ann",
    assignments: [
      {
        assignmentId: "a",
        roleId: "r",
        roleKey: "x",
        locationId: null,
        permissions,
      },
    ],
  };
}

afterEach(cleanup);

describe("AppShell", () => {
  it("marks the active nav item and renders children", () => {
    render(
      <AppShell
        actor={actorWith(DEFAULT_ROLE_PERMISSIONS.owner)}
        experience="owner"
      >
        <p>page body</p>
      </AppShell>,
    );
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(screen.getByText("page body")).toBeInTheDocument();
    const current = nav.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Roles");
  });

  it("shows the experience switcher only with more than one experience", () => {
    const { unmount } = render(
      <AppShell
        actor={actorWith(DEFAULT_ROLE_PERMISSIONS.manager)}
        experience="manager"
      >
        x
      </AppShell>,
    );
    expect(
      screen.getByRole("navigation", { name: "Experience" }),
    ).toBeInTheDocument();
    unmount();
    render(
      <AppShell
        actor={actorWith(DEFAULT_ROLE_PERMISSIONS.employee)}
        experience="employee"
      >
        x
      </AppShell>,
    );
    expect(screen.queryByRole("navigation", { name: "Experience" })).toBeNull();
  });
});
