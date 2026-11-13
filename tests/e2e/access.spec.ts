import { expect, test } from "@playwright/test";

// Read-only checks as a signed-out visitor. No data is created or changed.

test("sign-in page loads with email field", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("sign-in response carries security headers", async ({ request }) => {
  const response = await request.get("/sign-in");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
});

for (const path of ["/hub", "/manager", "/owner"]) {
  test(`signed-out visitor is redirected from ${path} to /sign-in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
  });
}

test("invalid invite token shows the not-found message", async ({ page }) => {
  await page.goto("/invite/abc");
  await expect(
    page.getByText("We could not find this invite. Check the link or ask for a new one."),
  ).toBeVisible();
});

for (const path of ["/no-access", "/owner/audit"]) {
  test(`signed-out visitor cannot reach ${path}`, async ({ page }) => {
    const response = await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
    const body = (await response?.text()) ?? "";
    expect(body).not.toContain("audit_log");
    await expect(page.getByText("invitation.created")).toHaveCount(0);
  });
}
