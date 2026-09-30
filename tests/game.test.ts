import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/game/game.ts";
import type { Command } from "../src/shared.js";
function setup() {
  const g = new Game();
  g.command("device-red", { type: "CREATE" });
  const act = (
    d: string,
    type: string,
    extra: Record<string, unknown> = {},
    now?: number,
  ) =>
    g.command(
      d,
      {
        type,
        lobbyId: g.lobby!.id,
        version: g.lobby!.version,
        epoch: g.lobby!.epoch,
        ...extra,
      },
      now,
    );
  for (const color of ["Red", "Blue", "Green", "Yellow"]) {
    const device = "device-" + color.toLowerCase();
    act(device, "JOIN", { color, name: color, picture: "" });
  }
  return { g, act };
}
test("creation and player identities are unique", () => {
  const { g, act } = setup();
  assert.equal(g.lobby!.players.length, 4);
  assert.throws(
    () => act("device-blue", "JOIN", { color: "Blue", name: "Again", picture: "" }),
    /already joined/,
  );
  assert.throws(() => g.command("x", { type: "CREATE" }), /already exists/);
});
test("invalid configuration and stale state are rejected", () => {
  const { g: h, act } = setup();
  assert.throws(
    () => act("device-red", "START", { version: 0 }),
    /room changed/,
  );
  assert.throws(() => act("device-blue", "START"), /Only the host/);
  assert.throws(() => act("device-red", "START", { epoch: 0 }), /room changed/);
  assert.ok(h.lobby);
});
test("deterministic migration and original host return preserve authority", () => {
  const { g } = setup();
  const id = g.lobby!.id;
  g.connection("device-red", false);
  assert.equal(g.lobby!.hostDeviceId, "device-blue");
  assert.equal(g.lobby!.epoch, 2);
  g.connection("device-red", true);
  assert.equal(g.lobby!.hostDeviceId, "device-blue");
  assert.equal(g.lobby!.id, id);
  assert.equal(g.player("device-red")!.color, "Red");
  g.connection("device-blue", false);
  assert.equal(g.lobby!.hostDeviceId, "device-red");
});
test("manual transfer and leave retain the lobby", () => {
  const { g, act } = setup();
  act("device-red", "TRANSFER", { playerId: g.player("device-green")!.id });
  assert.equal(g.lobby!.hostDeviceId, "device-green");
  act("device-green", "LEAVE");
  assert.equal(g.lobby!.hostDeviceId, "device-red");
  assert.equal(g.lobby!.players.length, 3);
  assert.equal(g.player("device-green"), undefined);
});
test("meeting phases use authoritative deadlines; host loss does not reset meeting", () => {
  const { g, act } = setup();
  act("device-red", "START");
  act("device-blue", "MEETING", {}, 1000);
  assert.equal(g.lobby!.phase, "MEETING_INTRO");
  g.tick(4000);
  assert.equal(g.lobby!.phase, "MEETING_DISCUSSION");
  assert.equal(g.lobby!.deadline, 94000);
  g.connection("device-red", false);
  assert.equal(g.lobby!.deadline, 94000);
  assert.equal(g.lobby!.hostDeviceId, "device-blue");
  g.tick(94000);
  assert.equal(g.lobby!.phase, "MEETING_VOTING");
});
function voting() {
  const out = setup();
  out.act("device-red", "START");
  out.act("device-red", "MEETING", {}, 0);
  out.g.tick(3000);
  out.g.tick(93000);
  return out;
}

test("joining and editing profiles work without color selection", () => {
  const g = new Game();
  g.command("host", { type: "CREATE" });
  assert.deepEqual(g.lobby!.players, []);
  const command = (
    device: string,
    type: string,
    extra: Record<string, unknown> = {},
  ) =>
    g.command(device, {
      type,
      lobbyId: g.lobby!.id,
      version: g.lobby!.version,
      epoch: g.lobby!.epoch,
      ...extra,
    });
  assert.throws(
    () => command("guest-b", "JOIN", { color: "Blue", name: "  ", picture: "" }),
    /Names/,
  );
  assert.throws(
    () => command("guest-b", "JOIN", { color: "Green", name: "Sam", picture: "data:text/html;base64,AAAA" }),
    /picture/,
  );
  command("guest-b", "JOIN", { color: "Blue", name: "  Sam  ", picture: "" });
  assert.equal(g.player("guest-b")!.name, "Sam");
  command("guest-b", "PROFILE", { color: "Blue", name: "Sammy", picture: "data:image/jpeg;base64,AAAA" });
  assert.equal(g.player("guest-b")!.name, "Sammy");
  assert.equal(g.player("guest-b")!.picture, "data:image/jpeg;base64,AAAA");
  assert.equal(
    g.lobby!.hostDeviceId,
    "host",
    "Host keeps authority while another player joins",
  );
  command("host", "JOIN", { color: "Red", name: "Alex", picture: "" });
  assert.equal(g.lobby!.players.length, 2);
  assert.throws(() => command("host", "START"), /4 connected/);
  command("guest-a", "CANCEL_SELECTION");
  g.connection("host", false);
  assert.equal(
    g.player("host")!.name,
    "Alex",
    "The profile remains in the lobby on disconnect",
  );
});

test("unfinished host can cancel or disconnect without leaving an orphan lobby", () => {
  const g = new Game();
  g.command("host", { type: "CREATE" });
  g.connection("host", false);
  assert.equal(g.lobby, null);
  const { act } = setup();
  assert.throws(
    () => act("device-yellow", "JOIN", { color: "Cyan", name: "Again", picture: "" }),
    /already joined/,
  );
});
test("private choices, duplicate prevention, timeout and ejection", () => {
  const { g, act } = voting();
  const target = g.player("device-blue")!.id;
  act("device-red", "VOTE", { target }, 94000);
  assert.throws(
    () => act("device-red", "VOTE", { target: "skip" }, 94000),
    /locked/,
  );
  assert.deepEqual(g.snapshot("device-green").lobby!.votes, {});
  assert.equal(g.snapshot("device-green").myVote, undefined);
  assert.equal(g.snapshot("device-red").myVote, target);
  g.connection("device-red", false);
  assert.equal(Object.keys(g.lobby!.votes).length, 1);
  g.tick(138000);
  assert.equal(g.lobby!.phase, "MEETING_RESULTS");
  assert.equal(g.lobby!.result!.ejected, target);
  assert.equal(g.player("device-blue")!.alive, false);
});
test("ties and skips eject nobody", () => {
  const { g, act } = voting();
  act("device-red", "VOTE", { target: g.player("device-blue")!.id }, 94000);
  act("device-blue", "VOTE", { target: "skip" }, 94000);
  g.tick(138000);
  assert.equal(g.lobby!.result!.ejected, null);
  assert.match(g.lobby!.result!.reason, /tied/);
  const { g: h } = voting();
  h.tick(138000);
  assert.equal(h.lobby!.result!.ejected, null);
});
test("all votes finish early and reset restores living players and preserves bindings", () => {
  const { g, act } = voting();
  const target = g.player("device-blue")!.id;
  for (const p of g.lobby!.players) act(p.deviceId!, "VOTE", { target }, 94000);
  assert.equal(g.lobby!.phase, "MEETING_RESULTS");
  act("device-red", "CONTINUE");
  assert.equal(g.lobby!.phase, "GAME_ACTIVE");
  assert.throws(() => act("device-blue", "MEETING"), /cannot be called/);
  act("device-red", "END_GAME");
  act("device-red", "START");
  assert.ok(g.lobby!.players.every((p) => p.alive && p.deviceId));
  assert.deepEqual(g.lobby!.votes, {});
});
test("reconnecting voter retains locked vote and deadline", () => {
  const { g, act } = voting();
  act("device-blue", "VOTE", { target: "skip" }, 94000);
  const deadline = g.lobby!.deadline;
  g.connection("device-blue", false);
  g.connection("device-blue", true);
  assert.equal(g.snapshot("device-blue").myVote, "skip");
  assert.equal(g.lobby!.deadline, deadline);
});
test("minimum crew, identity ownership, ended lobby and invalid target validation", () => {
  const { g, act } = setup();
  g.connection("device-yellow", false);
  assert.throws(() => act("device-red", "START"), /4 connected/);
  assert.throws(() => act("unknown", "START"), /Join the crew/);
  g.connection("device-yellow", true);
  act("device-red", "START");
  act("device-red", "MEETING", {}, 0);
  g.tick(3000);
  g.tick(93000);
  assert.throws(
    () => act("device-blue", "VOTE", { target: "made-up" }, 94000),
    /living player/,
  );
  assert.throws(
    () => act("device-blue", "VOTE", { target: "skip" }, 138000),
    /closed/,
  );
  act("device-red", "END_LOBBY");
  assert.equal(g.lobby, null);
});
