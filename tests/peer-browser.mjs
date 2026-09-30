import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import jsQR from "jsqr";
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [],
  wire = [];
try {
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const watch = (page) => {
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("websocket", (ws) =>
      ws.on("framesent", (frame) => {
        try {
          wire.push(JSON.parse(String(frame.payload)).type);
        } catch {}
      }),
    );
  };
  for (let i = 0; i < 4; i++) {
    watch(pages[i]);
    await pages[i].goto(`http://localhost:5175/?device=peer-${i}`);
  }
  await pages[0].getByRole("button", { name: /^Create Lobby/ }).click();
  await pages[0].getByLabel("Your name").fill("Red");
  const picture = await sharp({
    create: { width: 96, height: 96, channels: 3, background: "#f04747" },
  }).png().toBuffer();
  await pages[0].locator('input[type="file"]').setInputFiles({
    name: "red.png",
    mimeType: "image/png",
    buffer: picture,
  });
  await pages[0].locator(".profile-fields .player-avatar img").waitFor();
  await pages[0]
    .getByRole("button", { name: "Join as Red", exact: true })
    .click();
  await pages[0].getByRole("heading", { name: "Game Night Lobby" }).waitFor();
  const code = await pages[0].getByTestId("room-code").textContent();
  await pages[0].getByRole("button", { name: "Invite", exact: false }).click();
  const img = pages[0].getByAltText(`Invitation QR for room ${code}`);
  await img.waitFor();
  const png = Buffer.from(
    (await img.getAttribute("src")).split(",")[1],
    "base64",
  );
  const image = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const decoded = jsQR(
    new Uint8ClampedArray(image.data),
    image.info.width,
    image.info.height,
  );
  assert.equal(new URL(decoded.data).searchParams.get("room"), code);
  await pages[0].screenshot({
    path: "test-results/invitation-mobile.png",
    fullPage: true,
  });
  await pages[0].getByRole("button", { name: "Close dialog" }).click();
  await pages[1].goto(decoded.data + "&device=peer-1");
  await pages[1].getByLabel("Your name").waitFor();
  for (let i = 2; i < 4; i++) {
    await pages[i].getByRole("button", { name: /^Join Lobby/ }).click();
    await pages[i].getByLabel("Your name").waitFor();
  }
  for (let i = 1; i < 4; i++) {
    const name = ["Red", "Blue", "Green", "Yellow"][i];
    await pages[i].getByLabel("Your name").fill(name);
    await pages[i]
      .getByRole("button", { name: "Join as " + name, exact: true })
      .click();
    await pages[i].getByRole("heading", { name: "Game Night Lobby" }).waitFor();
    if (i < 3)
      await expect(
        pages[0].getByRole("button", { name: "Start Game" }),
      ).toBeDisabled();
  }
  await expect(
    pages[0].getByRole("button", { name: "Start Game" }),
  ).toBeEnabled();
  await pages[0].screenshot({
    path: "test-results/peer-lobby.png",
    fullPage: true,
  });
  await pages[0].getByRole("button", { name: "Device settings" }).click();
  await pages[0].locator('input[type="file"]').setInputFiles({
    name: "new.png",
    mimeType: "image/png",
    buffer: picture,
  });
  await pages[0].getByRole("button", { name: "Save profile" }).click();
  const savedProfile = await pages[0].evaluate(() =>
    JSON.parse(localStorage.getItem("meeting-peer-peer-0-profile") || "null"),
  );
  assert.equal(savedProfile.name, "Red");
  assert.match(savedProfile.picture, /^data:image\/jpeg;base64,/);
  await pages[0].getByRole("button", { name: "Lobby menu" }).click();
  await pages[0]
    .getByRole("button", { name: "Game settings", exact: true })
    .click();
  await pages[0].getByLabel("Discussion duration").selectOption("0");
  await pages[0].getByRole("button", { name: "Save settings" }).click();
  await pages[0].getByRole("button", { name: "Start Game" }).click();
  await pages[0]
    .getByRole("button", { name: "Emergency Meeting", exact: true })
    .click();
  await pages[0]
    .getByRole("button", { name: "Call Meeting", exact: true })
    .click();
  await pages[0]
    .getByRole("heading", { name: "Who is the Impostor?" })
    .waitFor();
  await pages[0].getByRole("button", { name: /^Blue / }).click();
  await pages[0].getByRole("button", { name: "Confirm Vote" }).click();
  await expect(
    pages[0].getByText("Vote locked. Waiting for the crew…"),
  ).toBeVisible();
  const replica = await pages[1].evaluate(
    () => Object.entries(localStorage).find(([k]) => k.endsWith("-state"))?.[1],
  );
  assert.deepEqual(JSON.parse(replica).lobby.votes, {});
  await pages[0].close();
  await pages[1]
    .getByText("Blue is now the host", { exact: true })
    .waitFor({ timeout: 30000 });
  const returned = await contexts[0].newPage();
  watch(returned);
  await returned.goto("http://localhost:5175/?device=peer-0");
  await returned
    .getByRole("heading", { name: "Who is the Impostor?" })
    .waitFor();
  await expect(
    returned.getByText("Vote locked. Waiting for the crew…"),
  ).toBeVisible();
  await returned.getByRole("button", { name: "Lobby menu" }).click();
  await expect(
    returned.getByRole("button", { name: "Transfer host", exact: true }),
  ).toHaveCount(0);
  await returned.getByRole("button", { name: "Close dialog" }).click();
  for (let i = 1; i < 4; i++) {
    await pages[i].getByRole("button", { name: /^Blue / }).click();
    await pages[i].getByRole("button", { name: "Confirm Vote" }).click();
  }
  await Promise.all(
    [...pages.slice(1), returned].map((p) =>
      p
        .getByRole("heading", { name: "Blue was ejected." })
        .waitFor({ timeout: 15000 }),
    ),
  );
  await pages[1].getByRole("button", { name: "Continue Game" }).click();
  await returned.getByRole("heading", { name: "You are Red." }).waitFor();
  await pages[1].getByRole("button", { name: "Lobby menu" }).click();
  await pages[1]
    .getByRole("button", { name: "Transfer host", exact: true })
    .click();
  await pages[1].getByRole("button", { name: /^Green Connected/ }).click();
  await pages[1]
    .getByRole("button", { name: "Transfer Host", exact: true })
    .click();
  await pages[2].getByText("Green is now the host", { exact: true }).waitFor();
  await pages[2].getByRole("button", { name: "Lobby menu" }).click();
  await pages[2]
    .getByRole("button", { name: "End lobby", exact: true })
    .click();
  await pages[2]
    .getByRole("button", { name: "End Lobby", exact: true })
    .click();
  await returned.getByRole("heading", { name: /Trust your crew/ }).waitFor();
  for (const p of [...pages.slice(1), returned])
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  assert.deepEqual(errors, []);
  assert.ok(wire.includes("SIGNAL"));
  assert.ok(
    !wire.some((t) =>
      ["STATE", "COMMAND", "COMMIT", "VOTE", "REVEAL"].includes(t),
    ),
  );
  console.log(
    "PASS: photo profiles, automatic joining, invitation QR, four-player minimum, direct WebRTC gameplay, hidden vote commitments, host migration during voting, restored ballot/identity, manual host transfer, and no game messages on the signaling socket.",
  );
} catch (e) {
  for (const page of browser.contexts().flatMap((c) => c.pages())) {
    if (!page.isClosed()) {
      console.log("PAGE", await page.locator("body").innerText());
      await page.screenshot({
        path: "test-results/peer-failure.png",
        fullPage: true,
      });
      break;
    }
  }
  throw e;
} finally {
  await browser.close();
}
