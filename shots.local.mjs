// Scratch: screenshots and tool-row measurements (not committed).
import { chromium } from "@playwright/test";

const OUT = process.argv[2];
const URL = "http://127.0.0.1:8947/";
const browser = await chromium.launch();
const sizes = [
  [1440, 900],
  [1280, 800],
  [390, 844],
];
for (const [w, h] of sizes) {
  for (const scheme of w === 390 ? ["light"] : ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme });
    page.setDefaultTimeout(5000);
    const name = `${w}-${scheme}`;
    await page.goto(URL);
    await page.getByRole("button", { name: "Beginner tips" }).click();
    await page.screenshot({ path: `${OUT}/landing-${name}.png` });
    await page.getByRole("button", { name: /Ode to Joy/ }).click();
    await page.locator("#staff svg").waitFor();
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading the piano"),
      null,
      {
        timeout: 15000,
      },
    );
    const row = await page.locator("#staff .header").evaluate((el) => {
      const r = el.getBoundingClientRect();
      const kids = [...el.querySelectorAll("button, label")].map((k) => k.getBoundingClientRect());
      return {
        h: r.height,
        w: r.width,
        sw: el.scrollWidth,
        tops: [...new Set(kids.map((k) => Math.round(k.top)))],
      };
    });
    console.log(name, "row", JSON.stringify(row));
    await page.screenshot({ path: `${OUT}/ode-before-key-${name}.png` });
    await page
      .locator("#key-prompt")
      .getByRole("group", { name: "Home note" })
      .getByRole("button", { name: "D", exact: true })
      .click();
    await page.waitForTimeout(400);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${OUT}/ode-after-key-${name}.png` });
    const staff = await page.locator("#staff").boundingBox();
    console.log(
      name,
      "staff",
      JSON.stringify(staff),
      "scrollY",
      await page.evaluate(() => scrollY),
    );
    await page.close();
  }
}
await browser.close();
