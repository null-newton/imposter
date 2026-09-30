import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { createSignalingServer } from "../server/signaling.mjs";
function next(ws, type) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off("message", on);
      reject(Error("Timed out: " + type));
    }, 3000);
    const on = (raw) => {
      const m = JSON.parse(raw);
      if (m.type === type) {
        clearTimeout(timeout);
        ws.off("message", on);
        resolve(m);
      }
    };
    ws.on("message", on);
  });
}
test("signaling isolates rooms, relays descriptions, rejects gameplay, and migrates host", async () => {
  const app = createSignalingServer({
    origins: ["http://test.local"],
    graceMs: 30,
    heartbeatMs: 50,
  });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const url = `ws://127.0.0.1:${app.server.address().port}/signal`;
  const sockets = [];
  async function client(saved) {
    const credentials = saved || { id: randomUUID(), token: randomUUID() };
    const ws = new WebSocket(url, { origin: "http://test.local" });
    sockets.push(ws);
    await new Promise((r) => ws.on("open", r));
    const welcome = next(ws, "WELCOME");
    ws.send(JSON.stringify({ type: "HELLO", ...credentials }));
    await welcome;
    return { ws, credentials, send: (m) => ws.send(JSON.stringify(m)) };
  }
  try {
    const a = await client(),
      b = await client(),
      c = await client();
    let wait = next(a.ws, "ROOM");
    a.send({ type: "CREATE" });
    const room = await wait;
    assert.equal(room.hostId, a.credentials.id);
    wait = next(b.ws, "ROOM");
    b.send({ type: "JOIN_ROOM", code: room.code });
    await wait;
    wait = next(b.ws, "ROOM");
    b.send({ type: "READY" });
    await wait;
    wait = next(c.ws, "ROOM");
    c.send({ type: "CREATE" });
    const other = await wait;
    assert.notEqual(room.code, other.code);
    wait = next(a.ws, "ERROR");
    a.send({
      type: "SIGNAL",
      to: c.credentials.id,
      data: { kind: "offer", sdp: { type: "offer", sdp: "test" } },
    });
    assert.match((await wait).message, /reconnecting/);
    wait = next(b.ws, "SIGNAL");
    a.send({
      type: "SIGNAL",
      to: b.credentials.id,
      data: { kind: "offer", sdp: { type: "offer", sdp: "test" } },
    });
    assert.equal((await wait).from, a.credentials.id);
    wait = next(a.ws, "ERROR");
    a.send({ type: "VOTE", target: "Red" });
    assert.match((await wait).message, /Unknown/);
    wait = next(b.ws, "ROOM");
    a.ws.close();
    const migrated = await wait;
    assert.equal(migrated.hostId, b.credentials.id);
    assert.equal(migrated.epoch, 2);
    const returned = await client(a.credentials);
    wait = next(returned.ws, "ROOM");
    returned.send({ type: "JOIN_ROOM", code: room.code });
    assert.equal((await wait).hostId, b.credentials.id);
    wait = next(returned.ws, "ERROR");
    returned.send({ type: "END_ROOM" });
    assert.match((await wait).message, /Only the host/);
    wait = next(returned.ws, "ENDED");
    b.send({ type: "END_ROOM" });
    await wait;
    assert.equal(app.rooms.has(room.code), false);
  } finally {
    for (const ws of sockets) ws.terminate();
    await app.close();
  }
});

test("automatic joining finds one lobby on the same connection and offers a choice for several", async () => {
  const app = createSignalingServer({ origins: ["http://test.local"] });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const url = `ws://127.0.0.1:${app.server.address().port}/signal`;
  const sockets = [];
  async function client(ip) {
    const ws = new WebSocket(url, {
      origin: "http://test.local",
      headers: { "CF-Connecting-IP": ip },
    });
    sockets.push(ws);
    await new Promise((resolve) => ws.on("open", resolve));
    const welcome = next(ws, "WELCOME");
    ws.send(JSON.stringify({ type: "HELLO", id: randomUUID(), token: randomUUID() }));
    await welcome;
    return { ws, send: (message) => ws.send(JSON.stringify(message)) };
  }
  try {
    const host = await client("192.0.2.10");
    let wait = next(host.ws, "ROOM");
    host.send({ type: "CREATE" });
    const first = await wait;

    const guest = await client("192.0.2.10");
    wait = next(guest.ws, "ROOM");
    guest.send({ type: "JOIN_AUTO" });
    assert.equal((await wait).code, first.code);

    const otherNetwork = await client("192.0.2.11");
    wait = next(otherNetwork.ws, "ERROR");
    otherNetwork.send({ type: "JOIN_AUTO" });
    assert.match((await wait).message, /No lobby found/);

    const secondHost = await client("192.0.2.10");
    wait = next(secondHost.ws, "ROOM");
    secondHost.send({ type: "CREATE" });
    const second = await wait;

    const chooser = await client("192.0.2.10");
    wait = next(chooser.ws, "LOBBIES");
    chooser.send({ type: "JOIN_AUTO" });
    const choice = await wait;
    assert.deepEqual(
      choice.lobbies.map((lobby) => lobby.code).sort(),
      [first.code, second.code].sort(),
    );
    wait = next(chooser.ws, "ROOM");
    chooser.send({ type: "JOIN_ROOM", code: second.code });
    assert.equal((await wait).code, second.code);
  } finally {
    for (const ws of sockets) ws.terminate();
    await app.close();
  }
});
