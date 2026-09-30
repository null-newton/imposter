import { Game } from "../game/game";
import { identity, storageKey } from "./identity";
import { ballotHash, makeBallot, type Ballot } from "./votes";
import type { Command, Lobby, Snapshot } from "../shared";
type Member = { id: string; online: boolean; ready: boolean; order: number };
type RoomInfo = {
  code: string;
  lobbyId: string;
  hostId: string;
  epoch: number;
  members: Member[];
};
type Replica = {
  lobby: Lobby;
  commits: Record<string, string>;
  revealUntil: number;
};
type Link = {
  pc: RTCPeerConnection;
  channel?: RTCDataChannel;
  candidates: RTCIceCandidateInit[];
  seen: number;
  created: number;
};
type View = {
  snapshot: Snapshot;
  connected: boolean;
  signaling: boolean;
  error: string;
  notice: string;
  offset: number;
  code: string;
  joining: boolean;
  lobbies: { code: string; players: number }[];
  revealing: boolean;
};
const signalUrl =
  import.meta.env.VITE_SIGNAL_URL || "wss://imp-signal.zacsvae.com/signal";
export class RoomTransport {
  private ws?: WebSocket;
  private retry = 600;
  private stopped = false;
  private listeners = new Set<() => void>();
  private meta?: RoomInfo;
  private game = new Game();
  private links = new Map<string, Link>();
  private replica?: Replica;
  private ballot?: Ballot;
  private ballotHistory: Ballot[] = [];
  private commits: Record<string, string> = {};
  private revealUntil = 0;
  private recovery = 0;
  private recovered: Replica[] = [];
  private readySent = false;
  private lastPublish = 0;
  private sequence = Promise.resolve();
  private busyVote = false;
  private pendingTransfer?: { to: string; version: number };
  private view: View = {
    snapshot: { lobby: null, voted: [], serverTime: Date.now() },
    connected: false,
    signaling: false,
    error: "",
    notice: "",
    offset: 0,
    code: localStorage.getItem(storageKey + "-room") || "",
    joining: false,
    lobbies: [],
    revealing: false,
  };
  constructor() {
    try {
      this.replica =
        JSON.parse(localStorage.getItem(storageKey + "-state") || "null") ||
        undefined;
      this.ballot =
        JSON.parse(localStorage.getItem(storageKey + "-ballot") || "null") ||
        undefined;
      this.ballotHistory = JSON.parse(localStorage.getItem(storageKey + "-ballots") || "[]");
      if (this.ballot && !this.ballotHistory.some(b => b.hash === this.ballot!.hash)) this.ballotHistory.push(this.ballot);
      if (this.replica) this.display(this.replica);
    } catch {}
    this.connect();
    setInterval(() => this.tick(), 1000);
    window.addEventListener("online", () => this.connect());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.connect();
    });
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.view;
  private update(v: Partial<View>) {
    this.view = { ...this.view, ...v };
    this.listeners.forEach((fn) => fn());
  }
  clear() {
    this.update({ error: "", notice: "" });
  }
  private fail(e: unknown) {
    this.update({
      error: e instanceof Error ? e.message : String(e),
      joining: false,
    });
  }
  private signal(data: unknown) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(data));
    return true;
  }
  private connect() {
    if (
      this.stopped ||
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    )
      return;
    try {
      this.ws = new WebSocket(signalUrl);
    } catch (e) {
      this.fail(e);
      return;
    }
    const ws = this.ws;
    ws.onopen = () => this.signal({ type: "HELLO", ...identity });
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === "WELCOME") {
          this.retry = 600;
          this.update({ signaling: true, error: "" });
          if (this.view.code)
            this.signal({ type: "JOIN_ROOM", code: this.view.code });
          else this.update({ connected: true });
        }
        if (m.type === "ROOM") this.onRoom(m);
        if (m.type === "LOBBIES")
          this.update({ lobbies: m.lobbies, joining: false });
        if (m.type === "SIGNAL")
          void this.onSignal(m.from, m.data).catch((e) => this.fail(e));
        if (m.type === "ENDED" || m.type === "LEFT")
          this.reset(
            m.type === "ENDED" ? "The lobby has ended." : "You left the lobby.",
          );
        if (m.type === "DUPLICATE") {
          this.stopped = true;
          this.fail(m.message);
        }
        if (m.type === "ERROR") {
          this.fail(m.message);
          if (m.message.startsWith("Room not found"))
            this.reset("That room is no longer available.");
        }
      } catch (e) {
        this.fail(e);
      }
    };
    ws.onclose = () => {
      this.update({
        signaling: false,
        connected: !!this.replica && this.hasAuthorityConnection(),
      });
      if (!this.stopped) setTimeout(() => this.connect(), this.retry);
      this.retry = Math.min(8000, this.retry * 1.5);
    };
    ws.onerror = () => ws.close();
  }
  join(code: string) {
    const clean = code.toUpperCase().replace(/[ -]/g, "");
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(clean)) {
      this.fail("Enter the 8-character room code.");
      return;
    }
    if (this.view.code) {
      if (this.view.code !== clean)
        this.fail("Leave your current room before joining another.");
      return;
    }
    this.update({ joining: true, lobbies: [], error: "" });
    if (!this.signal({ type: "JOIN_ROOM", code: clean }))
      this.fail(
        "The connection service is unavailable. Please try again shortly.",
      );
  }
  joinAutomatically() {
    if (this.view.code || this.view.joining) return;
    this.update({ joining: true, lobbies: [], error: "" });
    if (!this.signal({ type: "JOIN_AUTO" }))
      this.fail("The connection service is unavailable. Please try again shortly.");
  }
  private reset(notice = "") {
    this.meta = undefined;
    this.game.lobby = null;
    this.replica = undefined;
    this.recovery = 0;
    this.readySent = false;
    this.commits = {};
    this.revealUntil = 0;
    for (const link of this.links.values()) link.pc.close();
    this.links.clear();
    localStorage.removeItem(storageKey + "-room");
    localStorage.removeItem(storageKey + "-state");
    localStorage.removeItem(storageKey + "-ballot");
    localStorage.removeItem(storageKey + "-ballots");
    this.ballotHistory = [];
    this.ballot = undefined;
    this.update({
      snapshot: { lobby: null, voted: [], serverTime: Date.now() },
      code: "",
      connected: this.view.signaling,
      joining: false,
      lobbies: [],
      revealing: false,
      notice,
    });
  }
  leave() {
    if (this.view.signaling) this.signal({ type: "LEAVE_ROOM" });
    else this.reset("You left the lobby.");
  }
  private onRoom(meta: RoomInfo) {
    const previous = this.meta;
    this.meta = meta;
    localStorage.setItem(storageKey + "-room", meta.code);
    this.update({ code: meta.code, joining: false, lobbies: [] });
    for (const [id, link] of this.links)
      if (!meta.members.some((p) => p.id === id && p.online)) {
        link.pc.close();
        this.links.delete(id);
      }
    for (const m of meta.members)
      if (m.id !== identity.id && m.online && !this.links.has(m.id))
        void this.makeLink(m.id, identity.id < m.id).catch((e) => this.fail(e));
    if (
      meta.hostId === identity.id &&
      (!previous ||
        previous.hostId !== identity.id ||
        previous.epoch !== meta.epoch)
    ) {
      if (!this.replica && meta.members.length === 1) {
        this.game.command(identity.id, { type: "CREATE" });
        this.game.lobby!.id = meta.lobbyId;
        this.game.lobby!.epoch = meta.epoch;
        this.commits = {};
        this.revealUntil = 0;
        this.publish();
      } else {
        this.recovery = Date.now() + 1800;
        this.recovered = this.replica ? [this.replica] : [];
        this.update({
          connected: false,
          notice: "Restoring the room on this device…",
        });
        for (const id of this.links.keys())
          this.peerSend(id, { type: "RECOVER" });
      }
    } else if (
      meta.hostId !== identity.id &&
      previous?.hostId === identity.id
    ) {
      this.game.lobby = null;
      this.recovery = 0;
    }
    this.update({ connected: this.hasAuthorityConnection() });
  }
  private hasAuthorityConnection() {
    return (
      !!this.meta &&
      !this.recovery &&
      (this.meta.hostId === identity.id
        ? !!this.game.lobby
        : this.links.get(this.meta.hostId)?.channel?.readyState === "open" &&
          !!this.replica &&
          this.replica.lobby.epoch === this.meta.epoch)
    );
  }
  private async makeLink(id: string, offer: boolean) {
    const old = this.links.get(id);
    if (old) {
      old.pc.close();
      this.links.delete(id);
    }
    const pc = new RTCPeerConnection({ iceServers: [] });
    const link: Link = {
      pc,
      candidates: [],
      seen: Date.now(),
      created: Date.now(),
    };
    this.links.set(id, link);
    pc.onicecandidate = (e) => {
      if (e.candidate)
        this.signal({
          type: "SIGNAL",
          to: id,
          data: { kind: "candidate", candidate: e.candidate.toJSON() },
        });
    };
    pc.ondatachannel = (e) => this.attach(id, link, e.channel);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed")
        this.update({
          notice:
            "A direct connection failed. Use the same Wi-Fi and avoid guest-network isolation.",
        });
      if (pc.connectionState === "closed" || pc.connectionState === "failed")
        this.update({ connected: this.hasAuthorityConnection() });
    };
    if (offer) {
      this.attach(
        id,
        link,
        pc.createDataChannel("meeting-room", { ordered: true }),
      );
      await pc.setLocalDescription(await pc.createOffer());
      this.signal({
        type: "SIGNAL",
        to: id,
        data: { kind: "offer", sdp: pc.localDescription },
      });
    }
    return link;
  }
  private async onSignal(id: string, data: any) {
    if (
      !this.meta?.members.some((p) => p.id === id && p.online) ||
      id === identity.id
    )
      return;
    let link = this.links.get(id);
    if (!link) link = await this.makeLink(id, false);
    const pc = link.pc;
    if (data.kind === "offer") {
      if (pc.signalingState !== "stable") {
        if (identity.id < id) return;
        await pc.setLocalDescription({ type: "rollback" });
      }
      await pc.setRemoteDescription(data.sdp);
      for (const candidate of link.candidates.splice(0))
        await pc.addIceCandidate(candidate);
      await pc.setLocalDescription(await pc.createAnswer());
      this.signal({
        type: "SIGNAL",
        to: id,
        data: { kind: "answer", sdp: pc.localDescription },
      });
    } else if (
      data.kind === "answer" &&
      pc.signalingState === "have-local-offer"
    ) {
      await pc.setRemoteDescription(data.sdp);
      for (const candidate of link.candidates.splice(0))
        await pc.addIceCandidate(candidate);
    } else if (data.kind === "candidate" && data.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
      else link.candidates.push(data.candidate);
    }
  }
  private attach(id: string, link: Link, channel: RTCDataChannel) {
    link.channel = channel;
    channel.onopen = () => {
      link.seen = Date.now();
      this.update({ connected: this.hasAuthorityConnection(), joining: false });
      if (this.meta?.hostId === identity.id) {
        if (this.recovery) this.peerSend(id, { type: "RECOVER" });
        else this.publish();
      } else if (id === this.meta?.hostId)
        this.peerSend(id, { type: "SNAPSHOT_REQUEST" });
    };
    channel.onclose = () =>
      this.update({ connected: this.hasAuthorityConnection() });
    channel.onerror = () => {};
    channel.onmessage = (e) => {
      if (typeof e.data !== "string" || e.data.length > 100000) return;
      link.seen = Date.now();
      this.sequence = this.sequence.then(async () => {
        try {
          await this.receive(id, JSON.parse(e.data));
        } catch (e) {
          this.peerSend(id, {
            type: "ERROR",
            message: e instanceof Error ? e.message : "Invalid action.",
          });
        }
      });
    };
  }
  private peerSend(id: string, message: unknown) {
    const ch = this.links.get(id)?.channel;
    if (ch?.readyState === "open" && ch.bufferedAmount < 1000000) {
      ch.send(JSON.stringify(message));
      return true;
    }
    return false;
  }
  private async receive(from: string, m: any) {
    const meta = this.meta;
    if (!meta) return;
    if (m.type === "PING") {
      this.peerSend(from, { type: "PONG" });
      return;
    }
    if (m.type === "PONG") return;
    if (m.type === "ERROR" && from === meta.hostId) {
      this.fail(m.message);
      return;
    }
    if (m.type === "LEFT_GAME" && from === meta.hostId) {
      this.leave();
      return;
    }
    if (m.type === "RECOVER" && from === meta.hostId && this.replica) {
      this.peerSend(from, { type: "RECOVERY_STATE", state: this.replica });
      return;
    }
    if (
      m.type === "RECOVERY_STATE" &&
      meta.hostId === identity.id &&
      this.recovery &&
      m.state?.lobby?.id === meta.lobbyId
    ) {
      this.recovered.push(m.state);
      return;
    }
    if (
      m.type === "STATE" &&
      from === meta.hostId &&
      m.state?.lobby?.id === meta.lobbyId &&
      m.state.lobby.epoch === meta.epoch
    ) {
      if (
        this.replica &&
        this.replica.lobby.epoch === meta.epoch &&
        this.replica.lobby.version > m.state.lobby.version
      )
        return;
      this.display(m.state, m.time);
      this.peerSend(from, {
        type: "STATE_ACK",
        version: m.state.lobby.version,
      });
      return;
    }
    if (
      m.type === "SNAPSHOT_REQUEST" &&
      meta.hostId === identity.id &&
      !this.recovery
    ) {
      this.publish();
      return;
    }
    if (meta.hostId !== identity.id || this.recovery) return;
    if (m.type === "COMMAND") await this.execute(from, m.command);
    if (m.type === "REVEAL") await this.reveal(from, m.ballot);
    if (
      m.type === "STATE_ACK" &&
      this.pendingTransfer?.to === from &&
      m.version >= this.pendingTransfer.version
    ) {
      this.signal({ type: "TRANSFER", to: from, epoch: meta.epoch });
      this.pendingTransfer = undefined;
    }
  }
  private display(state: Replica, time = Date.now()) {
    const prior = this.replica?.lobby;
    this.replica = structuredClone(state);
    localStorage.setItem(storageKey + "-state", JSON.stringify(this.replica));
    const mine = state.lobby.players.find((p) => p.deviceId === identity.id);
    const acceptedBallot = this.ballotHistory.find(b => b.round === state.lobby.meetingId && state.commits[b.playerId] === b.hash);
    let notice = this.view.notice;
    if (prior && prior.hostDeviceId !== state.lobby.hostDeviceId)
      notice = `${state.lobby.players.find((p) => p.deviceId === state.lobby.hostDeviceId)?.name || "A crewmate"} is now the host`;
    this.update({
      snapshot: {
        lobby: state.lobby,
        voted: Object.keys(state.commits),
        myVote: acceptedBallot?.target,
        serverTime: time,
      },
      offset: time - Date.now(),
      revealing: state.revealUntil > 0,
      connected: this.hasAuthorityConnection(),
      joining: false,
      notice,
    });
    if (!this.readySent && this.view.signaling && mine) {
      this.signal({ type: "READY" });
      this.readySent = true;
    }
  }
  private publish() {
    const l = this.game.lobby;
    if (!l || !this.meta) return;
    l.hostDeviceId = this.meta.hostId;
    l.epoch = this.meta.epoch;
    const publicLobby = structuredClone(l);
    if (l.phase !== "MEETING_RESULTS" || l.settings.anonymous)
      publicLobby.votes = {};
    const state: Replica = {
      lobby: publicLobby,
      commits: { ...this.commits },
      revealUntil: this.revealUntil,
    };
    this.display(state);
    for (const id of this.links.keys())
      this.peerSend(id, { type: "STATE", state, time: Date.now() });
    this.lastPublish = Date.now();
  }
  send(command: Command) {
    if (command.type === "CREATE") {
      if (!this.view.signaling) {
        this.fail(
          "The connection service is unavailable. Please try again shortly.",
        );
        return;
      }
      this.update({ joining: true });
      this.signal({ type: "CREATE" });
      return;
    }
    if (!this.meta || !this.view.connected) {
      this.fail("Reconnecting to the host. Please wait.");
      return;
    }
    if (command.type === "VOTE") {
      void this.cast(String(command.target));
      return;
    }
    const c = {
      ...command,
      lobbyId: this.meta.lobbyId,
      epoch: this.meta.epoch,
      version: this.view.snapshot.lobby?.version,
    };
    if (this.meta.hostId === identity.id)
      this.sequence = this.sequence
        .then(() => this.execute(identity.id, c))
        .catch((e) => this.fail(e));
    else if (!this.peerSend(this.meta.hostId, { type: "COMMAND", command: c }))
      this.fail("The host is reconnecting.");
  }
  private async execute(device: string, c: Command) {
    const meta = this.meta,
      l = this.game.lobby;
    if (!meta || !l || meta.hostId !== identity.id || this.recovery) return;
    if (!c || c.lobbyId !== l.id || c.epoch !== meta.epoch)
      throw Error("The room or host changed. Try again.");
    if (c.type === "VOTE")
      throw Error("Submit a private vote commitment first.");
    const me = l.players.find((p) => p.deviceId === device);
    if (c.type === "COMMIT") {
      if (
        c.lobbyId !== l.id ||
        c.epoch !== meta.epoch ||
        c.round !== l.meetingId ||
        l.phase !== "MEETING_VOTING" ||
        this.revealUntil ||
        Date.now() >= l.deadline ||
        !me?.alive ||
        !l.eligible.includes(me.id)
      )
        throw Error("Voting is closed.");
      if (
        this.commits[me.id] &&
        !l.settings.changes &&
        this.commits[me.id] !== c.hash
      )
        throw Error("Your vote is locked.");
      if (typeof c.hash !== "string" || !/^[a-f0-9]{64}$/.test(c.hash))
        throw Error("Invalid vote.");
      this.commits[me.id] = c.hash;
      this.game.touch("Vote submitted");
      this.publish();
      return;
    }
    if (c.type === "TRANSFER") {
      if (device !== meta.hostId) throw Error("Only the host can transfer.");
      const p = l.players.find((p) => p.id === c.playerId);
      if (
        !p?.deviceId ||
        !p.connected ||
        !meta.members.some((m) => m.id === p.deviceId && m.ready && m.online)
      )
        throw Error("Choose a connected player.");
      this.game.touch("Host transfer requested");
      this.pendingTransfer = { to: p.deviceId, version: l.version };
      this.publish();
      return;
    }
    if (c.type === "END_LOBBY") {
      if (device !== meta.hostId)
        throw Error("Only the host can end the lobby.");
      this.signal({ type: "END_ROOM" });
      return;
    }
    if (c.type === "CANCEL_SELECTION") {
      if (device === identity.id) {
        if (!l.players.length) this.signal({ type: "END_ROOM" });
        else this.signal({ type: "LEAVE_ROOM" });
        return;
      }
    }
    if (c.type === "LEAVE" && device === identity.id) {
      this.signal({ type: "LEAVE_ROOM" });
      return;
    }
    // The authority validates current state after serializing simultaneous commands.
    if (c.lobbyId !== l.id || c.epoch !== l.epoch)
      throw Error("The host changed. Try again.");
    this.game.command(device, { ...c, version: l.version });
    if (c.type === "MEETING" || c.type === "START" || c.type === "RETURN") {
      this.commits = {};
      this.revealUntil = 0;
    }
    if (c.type === "LEAVE") this.peerSend(device, { type: "LEFT_GAME" });
    if (this.game.lobby) this.publish();
  }
  private async cast(target: string) {
    if (this.busyVote) return;
    const l = this.replica?.lobby,
      me = l?.players.find((p) => p.deviceId === identity.id);
    if (!l || !me || l.phase !== "MEETING_VOTING" || this.view.revealing)
      return;
    this.busyVote = true;
    try {
      if (
        !l.settings.changes &&
        this.ballot?.round === l.meetingId
      )
        throw Error("Your vote is locked.");
      this.ballot = await makeBallot(l.meetingId!, me.id, target);
      this.ballotHistory = [...this.ballotHistory.filter(b=>b.round===l.meetingId),this.ballot];
      localStorage.setItem(storageKey + "-ballots", JSON.stringify(this.ballotHistory));
      localStorage.setItem(storageKey + "-ballot", JSON.stringify(this.ballot));
      const c = {
        type: "COMMIT",
        round: l.meetingId,
        hash: this.ballot.hash,
        lobbyId: l.id,
        epoch: l.epoch,
      };
      if (this.meta?.hostId === identity.id) await this.execute(identity.id, c);
      else this.peerSend(this.meta!.hostId, { type: "COMMAND", command: c });
    } catch (e) {
      this.fail(e);
    } finally {
      this.busyVote = false;
    }
  }
  private async reveal(device: string, b: Ballot) {
    const l = this.game.lobby,
      me = l?.players.find((p) => p.deviceId === device);
    if (
      !l ||
      !me ||
      !b ||
      !this.revealUntil ||
      l.phase !== "MEETING_VOTING" ||
      b.round !== l.meetingId ||
      b.playerId !== me.id ||
      this.commits[me.id] !== b.hash ||
      (await ballotHash(b.round, b.playerId, b.target, b.nonce)) !== b.hash
    )
      return;
    if (
      b.target !== "skip" &&
      !l.players.some((p) => p.id === b.target && p.alive)
    )
      return;
    l.votes[me.id] = b.target;
  }
  private tick() {
    const now = Date.now();
    if (this.view.signaling) this.signal({ type: "PING" });
    for (const [id, link] of this.links) {
      this.peerSend(id, { type: "PING" });
      if (
        this.view.signaling &&
        this.meta?.members.some((m) => m.id === id && m.online) &&
        now - link.created > 15000 &&
        (link.pc.connectionState === "failed" ||
          link.pc.connectionState === "closed" ||
          now - link.seen > 15000)
      )
        void this.makeLink(id, identity.id < id).catch(() => {});
    }
    if (
      this.recovery &&
      now >= this.recovery &&
      this.meta?.hostId === identity.id
    ) {
      this.recovery = 0;
      const newest = this.recovered
        .filter((s) => s.lobby.id === this.meta!.lobbyId)
        .sort(
          (a, b) =>
            b.lobby.epoch - a.lobby.epoch || b.lobby.version - a.lobby.version,
        )[0];
      if (!newest) {
        this.fail(
          "No saved room state is available. Ask another crewmate to reconnect.",
        );
        this.recovery = now + 3000;
        return;
      }
      this.game.lobby = structuredClone(newest.lobby);
      this.commits = { ...newest.commits };
      this.revealUntil = newest.revealUntil ? now + 5000 : 0;
      this.game.lobby.hostDeviceId = identity.id;
      this.game.lobby.epoch = this.meta.epoch;
      this.game.touch("Host restored");
      this.publish();
    }
    if (
      this.meta?.hostId === identity.id &&
      !this.recovery &&
      this.game.lobby
    ) {
      const l = this.game.lobby;
      let changed = false;
      for (const p of [...l.players]) {
        if (p.deviceId && !this.meta.members.some((m) => m.id === p.deviceId)) {
          if (l.phase === "LOBBY_WAITING")
            l.players = l.players.filter((other) => other.id !== p.id);
          else {
            p.deviceId = undefined;
            p.connected = false;
          }
          changed = true;
        }
      }
      for (const p of l.players) {
        const live =
          p.deviceId === identity.id ||
          (!!p.deviceId &&
            this.links.get(p.deviceId)?.channel?.readyState === "open" &&
            now - (this.links.get(p.deviceId)?.seen || 0) < 10000);
        if (p.connected !== live) {
          p.connected = live;
          changed = true;
        }
      }
      if (changed) this.game.touch("Connections updated");
      if (l.phase === "MEETING_VOTING") {
        if (
          !this.revealUntil &&
          (now >= l.deadline ||
            (l.settings.early && l.eligible.every((id) => this.commits[id])))
        ) {
          this.revealUntil = now + 5000;
          this.game.touch("Voting closed");
          changed = true;
        }
        if (
          this.revealUntil &&
          (now >= this.revealUntil ||
            Object.keys(this.commits).every((id) => l.votes[id]))
        ) {
          this.game.finish();
          this.revealUntil = 0;
          this.game.touch("Results revealed");
          changed = true;
        }
      } else if (this.game.tick(now)) changed = true;
      if (changed || now - this.lastPublish > 2000) this.publish();
    }
    const acceptedBallot = this.ballotHistory.find(b=>b.round===this.replica?.lobby.meetingId && this.replica?.commits[b.playerId]===b.hash);
    if (this.replica?.revealUntil && acceptedBallot) {
      if (this.meta?.hostId === identity.id)
        void this.reveal(identity.id, acceptedBallot);
      else if (this.meta)
        this.peerSend(this.meta.hostId, {
          type: "REVEAL",
          ballot: acceptedBallot,
        });
    }
    // Retry a stored, unacknowledged commitment after transient network loss.
    if(this.meta && this.ballot && this.replica?.lobby.phase==='MEETING_VOTING' && !this.replica.revealUntil && now+this.view.offset<this.replica.lobby.deadline && this.ballot.round===this.replica.lobby.meetingId && !this.replica.commits[this.ballot.playerId]){
      const command={type:'COMMIT',lobbyId:this.meta.lobbyId,epoch:this.meta.epoch,round:this.ballot.round,hash:this.ballot.hash};
      if(this.meta.hostId===identity.id)void this.execute(identity.id,command).catch(e=>this.fail(e));
      else this.peerSend(this.meta.hostId,{type:'COMMAND',command});
    }
    this.update({
      connected: this.meta
        ? this.hasAuthorityConnection()
        : this.view.signaling,
    });
  }
}
export const room = new RoomTransport();
