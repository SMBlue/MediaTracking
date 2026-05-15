import { test, expect } from "@playwright/test";

test.describe("auth gate", () => {
  test("unauthenticated visit to / redirects to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });

  test("login page renders Google sign-in", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "MBA Tracker" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign in with google/i })
    ).toBeVisible();
    await expect(page.getByText(/@bluestate\.co/i)).toBeVisible();
  });
});
