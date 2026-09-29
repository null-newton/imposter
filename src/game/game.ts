const randomUUID = () => crypto.randomUUID();
import {
  colors,
  type Lobby,
  type Player,
  type Command,
  type Settings,
} from "../shared.js";
const defaults: Settings = {
  discussion: 90,
  voting: 45,
  changes: false,
  anonymous: true,
  early: true,
};
export class Game {
  lobby: Lobby | null = null;
  touch(event: string) {
    if (this.lobby) {
      this.lobby.version++;
      this.lobby.events = [...this.lobby.events.slice(-29), event];
    }
  }
  require(ok: unknown, message: string): asserts ok {
    if (!ok) throw new Error(message);
  }
  player(device: string) {
    return this.lobby?.players.find((p) => p.deviceId === device);
  }
  connectedDevices = new Set<string>();
  releaseColor(device: string) {
    if (this.lobby?.reservations[device]) {
      delete this.lobby.reservations[device];
      this.touch("Color released");
    }
  }
  command(device: string, c: Command, now = Date.now()) {
    if (c.type === "CREATE") {
      this.require(!this.lobby, "A lobby already exists on this network.");
      this.connectedDevices.add(device);
      this.lobby = {
        id: randomUUID(),
        name: "Game Night Lobby",
        version: 1,
        epoch: 1,
        hostDeviceId: device,
        players: [],
        reservations: {},
        phase: "LOBBY_WAITING",
        settings: { ...defaults },
        deadline: 0,
        votes: {},
        eligible: [],
        events: ["Lobby created"],
      };
      return;
    }
    const l = this.lobby;
    this.require(l, "Lobby could not be found.");
    this.require(c.lobbyId === l.id, "This lobby has ended.");
    this.require(
      (c.version === l.version ||
        ["RESERVE_COLOR", "RELEASE_COLOR", "JOIN", "CANCEL_SELECTION"].includes(
          c.type,
        )) &&
        c.epoch === l.epoch,
      "The room changed. Please try again.",
    );
    const me = this.player(device);
    const host = () =>
      this.require(l.hostDeviceId === device, "Only the host can do that.");
    if (
      ["RESERVE_COLOR", "RELEASE_COLOR", "JOIN", "CANCEL_SELECTION"].includes(
        c.type,
      )
    ) {
      this.require(!me, "You already have a character.");
      if (c.type === "RELEASE_COLOR" || c.type === "CANCEL_SELECTION") {
        this.releaseColor(device);
        if (c.type === "CANCEL_SELECTION" && l.hostDeviceId === device) {
          l.hostDeviceId = "";
          this.elect();
          if (!l.players.length) {
            this.lobby = null;
            return;
          }
        }
      } else {
        this.require(
          l.phase === "LOBBY_WAITING",
          "The game is already underway.",
        );
        this.require(l.players.length < 15, "This lobby is full.");
        this.require(
          typeof c.color === "string" && colors.includes(c.color),
          "Choose a color.",
        );
        this.require(
          !l.players.some((p) => p.color === c.color) &&
            !Object.entries(l.reservations).some(
              ([id, color]) => id !== device && color === c.color,
            ),
          "That color is taken. Choose another.",
        );
        if (c.type === "RESERVE_COLOR") {
          l.reservations[device] = c.color;
        } else {
          this.require(
            l.reservations[device] === c.color,
            "Select an available color first.",
          );
          this.require(
            typeof c.name === "string" &&
              c.name.trim().length > 0 &&
              c.name.trim().length <= 24,
            "Names must be 1–24 characters.",
          );
          l.players.push({
            id: randomUUID(),
            name: c.name.trim(),
            color: c.color,
            deviceId: device,
            connected: true,
            alive: true,
            order: Math.max(-1, ...l.players.map((p) => p.order)) + 1,
          });
          delete l.reservations[device];
          this.elect();
        }
      }
    } else {
      this.require(me, "Join the crew first.");
      switch (c.type) {
        case "RENAME":
          host();
          this.require(
            typeof c.name === "string" &&
              c.name.trim().length > 0 &&
              c.name.length <= 40,
            "Use a name of 1–40 characters.",
          );
          l.name = c.name.trim();
          break;
        case "SETTINGS": {
          host();
          this.require(
            l.phase === "LOBBY_WAITING",
            "Change settings in the lobby.",
          );
          const s = c.settings as Settings;
          this.require(
            s &&
              Number.isInteger(s.discussion) &&
              s.discussion >= 0 &&
              s.discussion <= 600 &&
              Number.isInteger(s.voting) &&
              s.voting >= 10 &&
              s.voting <= 300 &&
              ["changes", "anonymous", "early"].every(
                (k) => typeof (s as any)[k] === "boolean",
              ),
            "Invalid settings.",
          );
          l.settings = { ...s };
          break;
        }
        case "TRANSFER": {
          host();
          const p = l.players.find((p) => p.id === c.playerId);
          this.require(
            p?.connected && p.deviceId,
            "Choose a connected player.",
          );
          l.hostDeviceId = p.deviceId;
          l.epoch++;
          break;
        }
        case "LEAVE":
          me.connected = false;
          if (l.phase === "LOBBY_WAITING")
            l.players = l.players.filter((p) => p.id !== me.id);
          else me.deviceId = undefined;
          if (l.hostDeviceId === device) l.hostDeviceId = "";
          if (!l.players.length) {
            this.lobby = null;
            return;
          }
          this.elect();
          break;
        case "END_LOBBY":
          host();
          this.lobby = null;
          return;
        case "START":
          host();
          this.require(
            l.phase === "LOBBY_WAITING" || l.phase === "GAME_ENDED",
            "Game already started.",
          );
          this.require(
            l.players.filter((p) => p.connected).length >= 4,
            "At least 4 connected players are needed.",
          );
          l.players.forEach((p) => (p.alive = true));
          l.votes = {};
          l.result = undefined;
          l.reservations = {};
          l.phase = "GAME_ACTIVE";
          break;
        case "MEETING":
          this.require(
            l.phase === "GAME_ACTIVE" && me.alive,
            "A meeting cannot be called now.",
          );
          l.phase = "MEETING_INTRO";
          l.meetingId = randomUUID();
          l.caller = me.id;
          l.deadline = now + 3000;
          l.votes = {};
          l.result = undefined;
          l.eligible = l.players
            .filter((p) => p.alive && p.deviceId)
            .map((p) => p.id);
          break;
        case "VOTE":
          this.require(
            l.phase === "MEETING_VOTING" &&
              now < l.deadline &&
              me.alive &&
              l.eligible.includes(me.id),
            "Voting is closed.",
          );
          this.require(
            !l.votes[me.id] || l.settings.changes,
            "Your vote is locked.",
          );
          this.require(
            c.target === "skip" ||
              l.players.some((p) => p.id === c.target && p.alive),
            "Choose a living player.",
          );
          l.votes[me.id] = String(c.target);
          if (l.settings.early && l.eligible.every((id) => l.votes[id]))
            this.finish();
          break;
        case "ALIVE":
          host();
          this.require(
            l.phase === "GAME_ACTIVE",
            "Update players between meetings.",
          );
          const p = l.players.find((p) => p.id === c.playerId);
          this.require(p, "Player not found.");
          p.alive = !p.alive;
          break;
        case "CONTINUE":
          host();
          this.require(l.phase === "MEETING_RESULTS", "Wait for results.");
          l.phase = "GAME_ACTIVE";
          break;
        case "END_GAME":
          host();
          l.phase = "GAME_ENDED";
          break;
        case "RETURN":
          host();
          this.require(l.phase === "GAME_ENDED", "End the game first.");
          l.phase = "LOBBY_WAITING";
          l.players.forEach((p) => (p.alive = true));
          l.votes = {};
          l.result = undefined;
          break;
        default:
          throw new Error("Unknown action.");
      }
    }
    this.touch(c.type);
  }
  elect() {
    const l = this.lobby;
    if (
      !l ||
      l.players.some((p) => p.deviceId === l.hostDeviceId && p.connected) ||
      (!l.players.some((p) => p.deviceId === l.hostDeviceId) &&
        this.connectedDevices.has(l.hostDeviceId))
    )
      return;
    const next = l.players
      .filter((p) => p.connected && p.deviceId)
      .sort(
        (a, b) => a.order - b.order || a.deviceId!.localeCompare(b.deviceId!),
      )[0];
    if (next) {
      l.hostDeviceId = next.deviceId!;
      l.epoch++;
      this.touch(`${next.name} is now the host`);
    }
  }
  connection(device: string, connected: boolean) {
    if (connected) this.connectedDevices.add(device);
    else {
      this.connectedDevices.delete(device);
      this.releaseColor(device);
    }
    const p = this.player(device);
    if (p && p.connected !== connected) {
      p.connected = connected;
      this.touch(
        connected ? `${p.name} reconnected` : `${p.name} disconnected`,
      );
      this.elect();
    }
    if (!p && !connected) {
      this.elect();
      if (
        this.lobby &&
        !this.lobby.players.length &&
        !this.connectedDevices.has(this.lobby.hostDeviceId)
      )
        this.lobby = null;
    }
  }
  tick(now = Date.now()) {
    const l = this.lobby;
    if (!l || now < l.deadline) return false;
    if (l.phase === "MEETING_INTRO") {
      l.phase = "MEETING_DISCUSSION";
      l.deadline += l.settings.discussion * 1000;
    } else if (l.phase === "MEETING_DISCUSSION") {
      l.phase = "MEETING_VOTING";
      l.deadline += l.settings.voting * 1000;
    } else if (l.phase === "MEETING_VOTING") this.finish();
    else return false;
    this.touch("Phase updated");
    return true;
  }
  finish() {
    const l = this.lobby!;
    const counts: Record<string, number> = { skip: 0 };
    Object.values(l.votes).forEach((v) => (counts[v] = (counts[v] || 0) + 1));
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const tied = sorted.length > 1 && sorted[0][1] === sorted[1][1];
    const ejected = !tied && sorted[0][0] !== "skip" ? sorted[0][0] : null;
    l.result = {
      counts,
      ejected,
      reason: tied
        ? "The vote was tied."
        : ejected
          ? "The crew has spoken."
          : "The crew chose to skip.",
    };
    if (ejected) l.players.find((p) => p.id === ejected)!.alive = false;
    l.phase = "MEETING_RESULTS";
  }
  snapshot(device: string) {
    const l = this.lobby;
    if (!l) return { lobby: null, voted: [], serverTime: Date.now() };
    return {
      lobby: {
        ...l,
        votes:
          l.phase === "MEETING_RESULTS" && !l.settings.anonymous ? l.votes : {},
      },
      voted: Object.keys(l.votes),
      myVote: l.votes[this.player(device)?.id || ""],
      serverTime: Date.now(),
    };
  }
}
