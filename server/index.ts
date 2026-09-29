import express from "express";
import { createServer } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { WebSocketServer, WebSocket } from "ws";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";
import { Game } from "./game.js";
const app = express();
const server =
  process.env.TLS_KEY && process.env.TLS_CERT
    ? createSecureServer(
        {
          key: readFileSync(process.env.TLS_KEY),
          cert: readFileSync(process.env.TLS_CERT),
        },
        app,
      )
    : createServer(app);
const game = new Game();
const identities: Record<string, string> = {};
const dataDir = process.env.DATA_DIR || ".data";
mkdirSync(dataDir, { recursive: true });
try {
  const saved = JSON.parse(readFileSync(dataDir + "/session.json", "utf8"));
  game.lobby = saved.lobby;
  Object.assign(identities, saved.identities);
  game.lobby?.players.forEach((p) => (p.connected = false));
  if (game.lobby) {
    game.lobby.reservations = {};
    if (game.lobby.phase === "LOBBY_WAITING")
      game.lobby.players = game.lobby.players.filter((p) => p.deviceId);
    if (!game.lobby.players.length) game.lobby = null;
  }
} catch {}
function save() {
  writeFileSync(
    dataDir + "/session.tmp",
    JSON.stringify({ lobby: game.lobby, identities }),
  );
  renameSync(dataDir + "/session.tmp", dataDir + "/session.json");
}
type Client = { device: string; seen: number; count: number; window: number };
const clients = new Map<WebSocket, Client>();
const absent = new Map<string, number>();
function broadcast() {
  for (const [ws, c] of clients)
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: "STATE", ...game.snapshot(c.device) }));
  save();
}
const wss = new WebSocketServer({ noServer: true, maxPayload: 16384 });
server.on("upgrade", (request, socket, head) => {
  if (request.url?.split("?")[0] === "/room") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  }
});
wss.on("connection", (ws, request) => {
  const origin = request.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.host) {
        ws.close(1008);
        return;
      }
    } catch {
      ws.close(1008);
      return;
    }
  }
  const timeout = setTimeout(() => {
    if (!clients.has(ws)) ws.close();
  }, 5000);
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      let client = clients.get(ws);
      if (!client) {
        if (
          msg.type !== "HELLO" ||
          typeof msg.device !== "string" ||
          !/^[a-zA-Z0-9-]{8,80}$/.test(msg.device)
        )
          throw new Error("Invalid device.");
        if (identities[msg.device] && identities[msg.device] !== msg.token)
          throw new Error(
            "Device identity could not be restored. Open a fresh test device.",
          );
        identities[msg.device] ||= randomUUID();
        client = {
          device: msg.device,
          seen: Date.now(),
          count: 0,
          window: Date.now(),
        };
        clients.set(ws, client);
        clearTimeout(timeout);
        absent.delete(msg.device);
        game.connection(msg.device, true);
        ws.send(
          JSON.stringify({ type: "IDENTITY", token: identities[msg.device] }),
        );
        broadcast();
        return;
      }
      client.seen = Date.now();
      if (msg.type === "PING") {
        ws.send(JSON.stringify({ type: "PONG", serverTime: Date.now() }));
        return;
      }
      if (Date.now() - client.window > 1000) {
        client.window = Date.now();
        client.count = 0;
      }
      if (++client.count > 20) throw new Error("Please slow down.");
      game.command(client.device, msg);
      broadcast();
    } catch (e) {
      ws.send(
        JSON.stringify({
          type: "ERROR",
          message:
            e instanceof Error ? e.message : "Unable to complete action.",
        }),
      );
      const c = clients.get(ws);
      if (c)
        ws.send(JSON.stringify({ type: "STATE", ...game.snapshot(c.device) }));
    }
  });
  ws.on("close", () => {
    clearTimeout(timeout);
    const c = clients.get(ws);
    clients.delete(ws);
    if (c && !Array.from(clients.values()).some((x) => x.device === c.device))
      absent.set(c.device, Date.now());
  });
});
setInterval(() => {
  let changed = false;
  for (const [ws, c] of clients)
    if (Date.now() - c.seen > 15000) ws.terminate();
  for (const [device, since] of absent)
    if (Date.now() - since > 8000) {
      game.connection(device, false);
      absent.delete(device);
      changed = true;
    }
  if (game.tick()) changed = true;
  if (changed) broadcast();
}, 500);
if (process.argv.includes("--production")) {
  app.use(express.static("dist"));
  app.get("*", (_, res) => res.sendFile("index.html", { root: "dist" }));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
server.listen(Number(process.env.PORT) || 5173, "0.0.0.0", () => {
  const scheme = process.env.TLS_KEY ? "https" : "http";
  console.log(
    `Meeting Room: ${scheme}://localhost:${process.env.PORT || 5173}`,
  );
  for (const entries of Object.values(networkInterfaces()))
    for (const n of entries || [])
      if (n.family === "IPv4" && !n.internal)
        console.log(
          `Join on Wi-Fi: ${scheme}://${n.address}:${process.env.PORT || 5173}`,
        );
});
