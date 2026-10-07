// The shared axe check for the e2e specs.

import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Wait for theme, hover and entrance transitions to finish, so contrast is
 * measured on final colors. Cancelled animations reject `finished`, and
 * infinite ones never settle, so it gives up after 2s.
 * @param {import("@playwright/test").Page} page
 */
export function settleAnimations(page) {
  return page.evaluate(() => {
    const finite = document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
    const settled = Promise.allSettled(finite.map((a) => a.finished));
    return Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 2000))]);
  });
}

/**
 * No axe violations on the page, once its animations have settled.
 * @param {import("@playwright/test").Page} page
 */
export async function axe(page) {
  await settleAnimations(page);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target).join(" | ")})`),
  ).toEqual([]);
}
