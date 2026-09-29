import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import WebSocket from "ws";
// Only the separate test server is reset; the normal LAN lobby is untouched.
let saved = {};
try {
  saved = JSON.parse(readFileSync(".data-test-pwa/session.json", "utf8"));
} catch {}
if (saved.lobby)
  await new Promise((resolve, reject) => {
    const w = new WebSocket("ws://localhost:5175/room");
    w.on("error", reject);
    w.on("open", () =>
      w.send(
        JSON.stringify({
          type: "HELLO",
          device: saved.lobby.hostDeviceId,
          token: saved.identities[saved.lobby.hostDeviceId],
        }),
      ),
    );
    w.on("message", (r) => {
      const m = JSON.parse(r);
      if (m.type === "STATE") {
        if (m.lobby)
          w.send(
            JSON.stringify({
              type: "END_LOBBY",
              lobbyId: m.lobby.id,
              version: m.lobby.version,
              epoch: m.lobby.epoch,
            }),
          );
        else {
          w.close();
          resolve();
        }
      }
    });
  });
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
try {
  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  desktop.on("pageerror", (e) => errors.push(e.message));
  await desktop.goto("http://localhost:5175");
  await desktop.getByRole("button", { name: "Create Lobby" }).waitFor();
  await desktop.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
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
  for (let i = 0; i < 4; i++) {
    pages[i].on("pageerror", (e) => errors.push(e.message));
    await pages[i].goto(`http://localhost:5175/?device=browser-${i}`);
  }
  await pages[0].screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  await pages[0].getByRole("button", { name: "Create Lobby" }).click();
  await pages[0].getByLabel("Your name").fill("Red");
  await pages[0]
    .getByRole("button", { name: "Red Available", exact: true })
    .click();
  await pages[0]
    .getByRole("button", { name: "Join as Red", exact: true })
    .click();
  await pages[0].getByRole("heading", { name: "Game Night Lobby" }).waitFor();
  assert.equal(
    await pages[0].getByRole("button", { name: "Start Game" }).isDisabled(),
    true,
  );
  for (let i = 1; i < 4; i++) {
    await pages[i].getByRole("button", { name: "Join Lobby" }).click();
    await pages[i].getByRole("button", { name: "Join Lobby" }).click();
    await pages[i]
      .getByLabel("Your name")
      .fill([, "Blue", "Green", "Yellow"][i]);
  }
  await pages[1]
    .getByRole("button", { name: "Blue Available", exact: true })
    .click();
  await pages[2]
    .getByRole("button", { name: "Blue Being chosen", exact: true })
    .waitFor();
  assert.equal(
    await pages[2]
      .getByRole("button", { name: "Blue Being chosen", exact: true })
      .isDisabled(),
    true,
  );
  await pages[1]
    .getByRole("button", { name: "Cyan Available", exact: true })
    .click();
  await pages[2]
    .getByRole("button", { name: "Blue Available", exact: true })
    .waitFor();
  await pages[1].getByRole("button", { name: "Back", exact: true }).click();
  await pages[2]
    .getByRole("button", { name: "Cyan Available", exact: true })
    .waitFor();
  await pages[1].getByRole("button", { name: "Join Lobby" }).click();
  await pages[1].getByRole("button", { name: "Join Lobby" }).click();
  for (let i = 1; i < 4; i++) {
    const color = [, "Blue", "Green", "Yellow"][i];
    await pages[i]
      .getByRole("button", { name: color + " Available", exact: true })
      .click();
    await pages[i]
      .getByRole("button", { name: "Join as " + color, exact: true })
      .click();
    await pages[i].getByRole("heading", { name: "Game Night Lobby" }).waitFor();
    if (i < 3)
      assert.equal(
        await pages[0].getByRole("button", { name: "Start Game" }).isDisabled(),
        true,
      );
  }
  await pages[0].waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent.includes("Start Game"),
      )?.disabled,
  );
  await pages[0].screenshot({
    path: "test-results/lobby-mobile.png",
    fullPage: true,
  });
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
  await pages[0].screenshot({
    path: "test-results/voting-mobile.png",
    fullPage: true,
  });
  for (let i = 0; i < 4; i++) {
    await pages[i].getByRole("button", { name: /^Blue / }).click();
    await pages[i].getByRole("button", { name: "Confirm Vote" }).click();
  }
  await Promise.all(
    pages.map((p) =>
      p.getByRole("heading", { name: "Blue was ejected." }).waitFor(),
    ),
  );
  await pages[0].screenshot({
    path: "test-results/results-mobile.png",
    fullPage: true,
  });
  await pages[0].getByRole("button", { name: "Continue Game" }).click();
  await pages[0].close();
  await pages[1]
    .getByText("Blue is now the host", { exact: true })
    .waitFor({ timeout: 20000 });
  const returned = await contexts[0].newPage();
  await returned.goto("http://localhost:5175/?device=browser-0");
  await returned.getByRole("heading", { name: "You are Red." }).waitFor();
  await returned.getByRole("button", { name: "Lobby menu" }).click();
  assert.equal(
    await returned
      .getByRole("button", { name: "Transfer host", exact: true })
      .count(),
    0,
  );
  await pages[1].getByRole("button", { name: "Lobby menu" }).click();
  await pages[1]
    .getByRole("button", { name: "End lobby", exact: true })
    .click();
  await pages[1]
    .getByRole("button", { name: "End Lobby", exact: true })
    .click();
  await pages[1].getByRole("heading", { name: /Trust your crew/ }).waitFor();
  for (const page of [desktop, ...pages.slice(1), returned])
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "No horizontal overflow",
    );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: desktop/mobile layout, four-client game, synchronized voting/ejection, host migration, restored identity, lobby end; no browser errors.",
  );
} finally {
  await browser.close();
}
