import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const endpoint = "wss://imp-signal.zacsvae.com/signal";
const health = await fetch("https://imp-signal.zacsvae.com/healthz");
assert.equal(health.status, 200);
assert.equal((await health.json()).service, "imp-signaling");

const sockets = [];
function next(ws, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", listener);
      reject(Error(`Timed out: ${type}`));
    }, 10000);
    const listener = (raw) => {
      const message = JSON.parse(raw);
      if (message.type === type) {
        clearTimeout(timer);
        ws.off("message", listener);
        resolve(message);
      }
    };
    ws.on("message", listener);
  });
}

async function client(origin) {
  const ws = new WebSocket(endpoint, { origin });
  sockets.push(ws);
  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  const welcome = next(ws, "WELCOME");
  ws.send(
    JSON.stringify({
      type: "HELLO",
      id: randomUUID(),
      token: randomUUID() + randomUUID(),
    }),
  );
  await welcome;
  return ws;
}

let host;
let ended = false;
try {
  host = await client("https://imp.zacsvae.com");
  const automatic = await client("http://localhost:5173");
  const manual = await client("https://imp.zacsvae.com");
  let wait = next(host, "ROOM");
  host.send('{"type":"CREATE"}');
  const room = await wait;

  wait = next(automatic, "ROOM");
  automatic.send('{"type":"JOIN_AUTO"}');
  assert.equal((await wait).lobbyId, room.lobbyId);

  wait = next(manual, "ROOM");
  manual.send(JSON.stringify({ type: "JOIN_ROOM", code: room.code }));
  assert.equal((await wait).lobbyId, room.lobbyId);

  wait = next(automatic, "ENDED");
  host.send('{"type":"END_ROOM"}');
  await wait;
  ended = true;
  console.log("PASS: public health, localhost WSS origin, automatic and manual joins, room end.");
} finally {
  if (!ended && host?.readyState === WebSocket.OPEN)
    host.send('{"type":"END_ROOM"}');
  for (const ws of sockets) ws.close();
}
