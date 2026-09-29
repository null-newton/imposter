import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto("http://localhost:5175");
  await page.evaluate(async () => {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Service worker did not activate")),
          15000,
        ),
      ),
    ]);
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const manifest = await (
    await page.request.get("http://localhost:5175/manifest.webmanifest")
  ).json();
  for (const icon of manifest.icons)
    assert.ok(
      (await page.request.get("http://localhost:5175" + icon.src)).ok(),
    );
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: /Trust your crew/ }).waitFor();
  await page
    .getByText("Connecting to the room service…", { exact: false })
    .waitFor();
  assert.ok(await page.locator("style,link[rel=stylesheet]").count());
  console.log(
    "PASS: production service worker, manifest icons, cached offline app shell and reconnect banner.",
  );
} finally {
  await browser.close();
}
