import type { Command, Snapshot } from "./shared";
const test = new URLSearchParams(location.search).get("device");
const key = test ? "meeting-device-" + test : "meeting-device";
function uuid() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
}
export const identity = JSON.parse(localStorage.getItem(key) || "null") || {
  id: uuid(),
  token: null,
};
localStorage.setItem(key, JSON.stringify(identity));
export interface Transport {
  subscribe(fn: () => void): () => void;
  getSnapshot(): View;
  send(command: Command): void;
}
type View = {
  snapshot: Snapshot;
  connected: boolean;
  error: string;
  notice: string;
  offset: number;
};
class RoomTransport implements Transport {
  private ws?: WebSocket;
  private listeners = new Set<() => void>();
  private retry = 500;
  private hadConnection = false;
  private view: View = {
    snapshot: { lobby: null, voted: [], serverTime: Date.now() },
    connected: false,
    error: "",
    notice: "",
    offset: 0,
  };
  constructor() {
    this.connect();
    setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN)
        this.ws.send(JSON.stringify({ type: "PING" }));
    }, 3000);
    window.addEventListener("online", () => this.connect());
    document.addEventListener("visibilitychange", () => {
      if (
        document.visibilityState === "visible" &&
        this.ws?.readyState !== WebSocket.OPEN
      )
        this.connect();
    });
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.view;
  update(v: Partial<View>) {
    this.view = { ...this.view, ...v };
    this.listeners.forEach((fn) => fn());
  }
  connect() {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    )
      return;
    const ws = (this.ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/room`,
    ));
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          type: "HELLO",
          device: identity.id,
          token: identity.token,
        }),
      );
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === "IDENTITY") {
        identity.token = m.token;
        localStorage.setItem(key, JSON.stringify(identity));
        this.update({
          connected: true,
          notice: this.hadConnection ? "Reconnected to your crew" : "",
          error: "",
        });
        this.hadConnection = true;
        this.retry = 500;
      }
      if (m.type === "STATE") {
        const old = this.view.snapshot.lobby;
        const mine = m.lobby?.players.find(
          (p: any) => p.deviceId === identity.id,
        );
        localStorage.setItem(
          "meeting-last",
          JSON.stringify({ lobbyId: m.lobby?.id, playerId: mine?.id }),
        );
        let notice = this.view.notice;
        if (notice === "Reconnected to your crew" && mine)
          notice = "Reconnected as " + mine.name;
        if (old && m.lobby && old.hostDeviceId !== m.lobby.hostDeviceId)
          notice = `${m.lobby.players.find((p: any) => p.deviceId === m.lobby.hostDeviceId)?.name || "A crewmate"} is now the host`;
        this.update({ snapshot: m, offset: m.serverTime - Date.now(), notice });
      }
      if (m.type === "PONG") this.update({ offset: m.serverTime - Date.now() });
      if (m.type === "ERROR") this.update({ error: m.message });
    };
    ws.onclose = () => {
      this.update({ connected: false });
      setTimeout(() => this.connect(), this.retry);
      this.retry = Math.min(this.retry * 1.5, 5000);
    };
    ws.onerror = () => ws.close();
  }
  send(c: Command) {
    if (!this.view.connected) {
      this.update({ error: "Connection lost — trying to reconnect…" });
      return;
    }
    const l = this.view.snapshot.lobby;
    this.ws!.send(
      JSON.stringify({
        ...c,
        lobbyId: l?.id,
        version: l?.version,
        epoch: l?.epoch,
      }),
    );
  }
  clear() {
    this.update({ error: "", notice: "" });
  }
}
export const room = new RoomTransport();
