import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import sharp from "sharp";

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5175/?device=profile-browser");
  await page.getByRole("button", { name: /^Create Lobby/ }).click();
  await page.getByLabel("Your name").fill("Nova");
  const picture = await sharp({
    create: { width: 128, height: 128, channels: 3, background: "#f04747" },
  }).png().toBuffer();
  await page.locator('input[type="file"]').setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: picture,
  });
  await page.locator(".profile-fields .player-avatar img").waitFor();
  await page.getByRole("button", { name: "Join as Nova" }).click();
  await page.getByRole("heading", { name: "Game Night Lobby" }).waitFor();
  await expect(page.locator(".player-row .player-avatar img")).toHaveCount(1);

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("meeting-peer-profile-browser-profile") || "null"),
  );
  assert.equal(stored.name, "Nova");
  assert.match(stored.picture, /^data:image\/jpeg;base64,/);
  assert.ok(stored.picture.length <= 3000);

  await page.getByRole("button", { name: "Device settings" }).click();
  await page.getByLabel("Your name").fill("Comet");
  await page.getByRole("button", { name: "Remove picture" }).click();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.locator(".player-row .player-info strong")).toHaveText("Comet");
  await expect(page.locator(".player-row .player-avatar img")).toHaveCount(0);
  const edited = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("meeting-peer-profile-browser-profile") || "null"),
  );
  assert.equal(edited.name, "Comet");
  assert.equal(edited.picture, "");
  assert.ok(edited.color);

  await page.getByRole("button", { name: "Lobby menu" }).click();
  await page.getByRole("button", { name: "End lobby", exact: true }).click();
  await page.getByRole("button", { name: "End Lobby", exact: true }).click();
  console.log("PASS: photo upload, local profile storage, live profile edit, and color fallback.");
} finally {
  await browser.close();
}
