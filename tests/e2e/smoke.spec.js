// The one UI test: it walks the golden path in CI with an axe check. In Phase 0
// the path is "the shell loads under the production CSP with every region";
// Phase 2 extends it to tune → key → chord audition → tutor exchange.

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("the app loads under the production CSP, with every region and no a11y violations", async ({
  page,
}) => {
  /** @type {string[]} */
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hear Hear", level: 1 })).toBeVisible();
  for (const region of ["Welcome", "Staff", "Chords", "Tutor", "Keyboard"]) {
    await expect(page.getByRole("region", { name: region })).toBeVisible();
  }

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  expect(problems).toEqual([]);
});
