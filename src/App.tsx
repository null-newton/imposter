import { Invite, JoinPanel } from "./Invite";
import { useEffect, useState, useSyncExternalStore } from "react";
import { room, identity } from "./transport";
import { colors, type Player, type Settings } from "./shared";
import {
  Avatar,
  Icon,
  Button,
  PlayerRow,
  Modal,
  Timer,
  Hero,
} from "./components";
export default function App() {
  const net = useSyncExternalStore(room.subscribe, room.getSnapshot);
  const l = net.snapshot.lobby;
  const me = l?.players.find((p) => p.deviceId === identity.id);
  const host = l?.hostDeviceId === identity.id;
  const [page, setPage] = useState("home");
  const [modal, setModal] = useState("");
  const selected = l?.reservations?.[identity.id] || "";
  const [playerName, setPlayerName] = useState(
    () => localStorage.getItem("meeting-player-name") || "",
  );
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [now, setNow] = useState(Date.now());
  const [prefs, setPrefs] = useState(() =>
    JSON.parse(
      localStorage.getItem("meeting-prefs") ||
        '{"sound":false,"haptics":true,"motion":false}',
    ),
  );
  const [settings, setSettings] = useState<Settings>({
    discussion: 90,
    voting: 45,
    changes: false,
    anonymous: true,
    early: true,
  });
  const [install, setInstall] = useState<any>(null);
  useEffect(() => {
    const code = new URLSearchParams(location.search).get("room");
    if (code && net.signaling && !net.code && !net.joining) {
      const url = new URL(location.href);
      url.searchParams.delete("room");
      history.replaceState(null, "", url);
      setPage("search");
      room.join(code);
    }
  }, [net.signaling]);
  const send = (type: string, extra: Record<string, unknown> = {}) =>
    room.send({ type, ...extra });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + net.offset), 250);
    return () => clearInterval(timer);
  }, [net.offset]);
  useEffect(() => {
    const listener = (e: Event) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener("beforeinstallprompt", listener);
    return () => window.removeEventListener("beforeinstallprompt", listener);
  }, []);
  useEffect(() => {
    localStorage.setItem("meeting-prefs", JSON.stringify(prefs));
    document.documentElement.classList.toggle("reduce-motion", prefs.motion);
  }, [prefs]);
  useEffect(() => {
    if (me) setPage("room");
    else if (host) setPage("host-character");
    else if (l) setPage("join-character");
    else if (!l && ["room", "host-character", "join-character"].includes(page))
      setPage("home");
  }, [me?.id, l?.id]);
  useEffect(() => {
    if (net.error || net.notice) {
      const t = setTimeout(() => room.clear(), 6500);
      return () => clearTimeout(t);
    }
  }, [net.error, net.notice]);
  useEffect(() => {
    if (l?.phase === "MEETING_INTRO") {
      if (prefs.haptics) navigator.vibrate?.([150, 80, 150]);
      if (prefs.sound) {
        try {
          const Audio =
            (window as any).AudioContext || (window as any).webkitAudioContext;
          const ctx = new Audio();
          const osc = ctx.createOscillator(),
            gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 440;
          gain.gain.setValueAtTime(0.12, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
          osc.start();
          osc.stop(ctx.currentTime + 0.65);
          osc.onended = () => ctx.close();
        } catch {}
      }
    }
  }, [l?.phase]);
  const back = () => {
    if (!me && net.code) room.leave();
    setPage("home");
  };
  const screen = me ? "room" : page;
  const connected = l?.players.filter((p) => p.connected).length || 0;
  const top = (
    <header className="site-header">
      <a
        href="/"
        className="brand"
        onClick={(e) => {
          e.preventDefault();
          if (!me) back();
        }}
      >
        <Avatar size={33} />
        <span>
          AMONG US<span className="brand-divider">/</span>
          <b>MEETING ROOM</b>
        </span>
      </a>
      <div className="header-right">
        <span className="network-pill">
          <span className={`live-dot ${!net.connected ? "amber" : ""}`} />
          {net.connected
            ? l
              ? "CREW CONNECTED"
              : "READY TO JOIN"
            : "CONNECTING"}
        </span>
        <button
          className="icon-button"
          aria-label="Device settings"
          onClick={() => setModal("device")}
        >
          <Icon name="settings" />
        </button>
      </div>
    </header>
  );
  const title = (eyebrow: string, heading: string, sub?: string) => (
    <div className="screen-title">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{heading}</h1>
      {sub && <p>{sub}</p>}
    </div>
  );
  function characterGrid() {
    return (
      <div className="character-grid">
        {colors.map((color) => {
          const taken = l?.players.some((p) => p.color === color);
          const reserved = Object.entries(l?.reservations || {}).some(
            ([id, c]) => id !== identity.id && c === color,
          );
          return (
            <button
              key={color}
              className={`character-card ${selected === color ? "selected" : ""}`}
              disabled={
                taken ||
                reserved ||
                !net.connected ||
                l?.phase !== "LOBBY_WAITING"
              }
              onClick={() => send("RESERVE_COLOR", { color })}
            >
              <Avatar color={color} size={72} />
              <strong>{color}</strong>
              <small>
                {taken
                  ? "Taken"
                  : reserved
                    ? "Being chosen"
                    : selected === color
                      ? "Selected"
                      : "Available"}
              </small>
              {selected === color && (
                <span className="selected-check">
                  <Icon name="check" size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="app-shell">
      {top}
      {!net.connected && (
        <div className="offline-banner" role="status">
          {net.code
            ? "Reconnecting to your crew…"
            : "Connecting to the room service…"}{" "}
          <small>
            Keep this screen open. If this continues, check your Wi-Fi or ask
            your host to reopen the app.
          </small>
        </div>
      )}
      <main className={screen === "home" ? "home-main" : "flow-main"}>
        {screen === "home" ? (
          <>
            <div className="home-layout">
              <section className="home-copy">
                <span className="eyebrow">
                  <span className="live-dot" /> SAME ROOM. SAME WI-FI.
                </span>
                <h1>
                  Trust your crew.
                  <br />
                  <span>Or don't.</span>
                </h1>
                <p className="home-description">
                  Your next emergency meeting starts here.
                  <br />
                  Gather your friends, pick a character, and let
                  <br className="desktop-break" /> the accusations begin.
                </p>
                <div className="home-actions">
                  <Button
                    disabled={!!l || !net.connected}
                    onClick={() => send("CREATE")}
                  >
                    <Icon name="plus" /> Create Lobby{" "}
                    <span className="button-arrow">→</span>
                  </Button>
                  <Button
                    tone="blue"
                    disabled={!net.connected}
                    onClick={() => setPage("search")}
                  >
                    <Icon name="users" /> Join Lobby{" "}
                    <span className="button-arrow">→</span>
                  </Button>
                </div>
                {l ? (
                  <p className="hint existing">
                    <span className="live-dot" /> You already have an active
                    room.
                  </p>
                ) : (
                  <p className="home-note">
                    <Icon name="wifi" size={16} /> Make sure everyone is on the
                    same Wi-Fi.
                  </p>
                )}
                <div className="home-tags">
                  <span>
                    <Icon name="users" size={15} /> 4–15 players
                  </span>
                  <i />
                  <span>No accounts</span>
                  <i />
                  <span>Just suspicion</span>
                </div>
              </section>
              <section
                className="home-visual"
                aria-label="Red crewmate at the emergency meeting button"
              >
                <div className="visual-heading">
                  THERE'S AN IMPOSTOR
                  <br />
                  <span>AMONG US</span>
                </div>
                <Hero />
                <div className="visual-caption">
                  <span>YOUR CREW. ONE ROOM.</span>
                  <span>A LITTLE SUSPICION.</span>
                </div>
              </section>
            </div>
            <section className="how-section">
              <div className="how-title">
                <span className="eyebrow">A GOOD ALIBI STARTS HERE</span>
                <h2>Less setup. More suspicion.</h2>
              </div>
              <div className="steps">
                {[
                  [
                    "01",
                    "Gather your crew",
                    "One Wi-Fi network. All your favorite suspects.",
                    "wifi",
                  ],
                  [
                    "02",
                    "Pick your character",
                    "Choose your color. Try to look innocent.",
                    "users",
                  ],
                  [
                    "03",
                    "Call a meeting",
                    "Discuss, vote, and send someone into space.",
                    "bolt",
                  ],
                ].map(([n, h, p, icon]) => (
                  <article className="step" key={n}>
                    <div className="step-top">
                      <Icon name={icon} size={22} />
                      <span>{n}</span>
                    </div>
                    <h3>{h}</h3>
                    <p>{p}</p>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            {!me && (
              <button className="back-link" onClick={back}>
                <Icon name="arrow" size={17} /> Back
              </button>
            )}
            {(screen === "host-character" || screen === "join-character") &&
              l && (
                <>
                  {title(
                    host ? "YOUR LOBBY IS OPEN" : "JOIN THE CREW",
                    "Who are you?",
                    "Enter your name and choose an available color.",
                  )}
                  <label className="player-name-field">
                    Your name
                    <input
                      value={playerName}
                      maxLength={24}
                      placeholder="Enter your name"
                      autoComplete="nickname"
                      onChange={(e) => {
                        setPlayerName(e.target.value);
                        localStorage.setItem(
                          "meeting-player-name",
                          e.target.value,
                        );
                      }}
                    />
                  </label>
                  <p className="hint" role="status">
                    Colors are reserved live while your crew chooses.
                  </p>
                  {characterGrid()}
                  {l.phase !== "LOBBY_WAITING" && (
                    <p className="hint">
                      The game has started. Join when the crew returns to the
                      lobby.
                    </p>
                  )}
                  <Button
                    disabled={
                      !net.connected ||
                      !selected ||
                      !playerName.trim() ||
                      l.phase !== "LOBBY_WAITING"
                    }
                    onClick={() =>
                      send("JOIN", { color: selected, name: playerName })
                    }
                  >
                    Join as {playerName.trim() || "your character"}{" "}
                    <Icon name="check" />
                  </Button>
                </>
              )}
            {screen === "search" && (
              <>
                {title(
                  "FIND YOUR PEOPLE",
                  "Join a lobby",
                  "One invitation. Your whole crew.",
                )}
                <JoinPanel
                  onJoin={(code) => room.join(code)}
                  disabled={!net.signaling}
                  joining={net.joining}
                />
                {net.code && !l && (
                  <>
                    <p className="hint">
                      Connecting directly to the host. Keep both screens open on
                      the same Wi-Fi.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => {
                        room.leave();
                        setPage("home");
                      }}
                    >
                      Cancel joining
                    </button>
                  </>
                )}
              </>
            )}
            {screen === "room" && l && me && (
              <>
                <div className="room-heading">
                  <div>
                    <span className="eyebrow">
                      {l.phase === "LOBBY_WAITING"
                        ? "THE CREW IS ASSEMBLING"
                        : "LIVE SESSION"}
                    </span>
                    <h1>{l.name}</h1>
                    <p>
                      <span className="live-dot" /> {connected}/
                      {l.players.length} connected{" "}
                      <span className="room-code">
                        ROOM <span data-testid="room-code">{net.code}</span>
                      </span>
                    </p>
                  </div>
                  <button
                    className="icon-button menu-trigger"
                    aria-label="Lobby menu"
                    onClick={() => setModal("menu")}
                  >
                    <Icon name="settings" />
                  </button>
                </div>
                {l.phase === "LOBBY_WAITING" && (
                  <>
                    <div className="panel crew-panel">
                      <div className="panel-heading">
                        <h2>
                          The crew <span>{l.players.length}/15</span>
                        </h2>
                        <span className="tiny-label">
                          {host ? "YOU’RE THE HOST" : "WAITING ROOM"}
                        </span>
                      </div>
                      <div className="player-list">
                        {l.players.map((p) => (
                          <PlayerRow
                            key={p.id}
                            p={p}
                            host={p.deviceId === l.hostDeviceId}
                            you={p.id === me.id}
                          >
                            <span
                              className={`connection-dot ${p.connected ? "online" : ""}`}
                            />
                          </PlayerRow>
                        ))}
                      </div>
                    </div>
                    <div className="share-strip">
                      <Icon name="wifi" />
                      <div>
                        <strong>Bring your crew aboard</strong>
                        <small>Share the room code or invitation QR.</small>
                      </div>
                      <button onClick={() => setModal("share")}>
                        Invite ↗
                      </button>
                    </div>
                    {host ? (
                      <Button
                        disabled={connected < 4 || !net.connected}
                        onClick={() => send("START")}
                      >
                        Start Game <Icon name="bolt" />
                      </Button>
                    ) : (
                      <div className="waiting-label">
                        Waiting for the host to start
                        <span className="loading-dots">…</span>
                      </div>
                    )}
                    <p className="hint">
                      {connected < 4
                        ? "At least 4 connected players are needed to start."
                        : "Everyone aboard? Start the game on your main device."}
                    </p>
                  </>
                )}
                {l.phase === "GAME_ACTIVE" && (
                  <>
                    <div className="active-character">
                      <span className="eyebrow">
                        {me.alive
                          ? "LOOK ALIVE, CREWMATE"
                          : "YOU’RE STILL PART OF THE CREW"}
                      </span>
                      <Avatar color={me.color} size={170} dead={!me.alive} />
                      <h2>You are {me.name}.</h2>
                      <p>
                        {me.alive
                          ? "Carry on. Keep an eye on your crew."
                          : "You were ejected. You can still watch the meetings."}
                      </p>
                    </div>
                    <Button
                      tone="red"
                      disabled={!me.alive || !net.connected}
                      onClick={() => setModal("emergency")}
                    >
                      <Icon name="bolt" /> Emergency Meeting
                    </Button>
                    <p className="hint">
                      Something suspicious? Bring everyone together.
                    </p>
                    {host && (
                      <button
                        className="text-button"
                        onClick={() => setModal("alive")}
                      >
                        Manage alive / ejected players
                      </button>
                    )}
                  </>
                )}
                {(l.phase === "MEETING_INTRO" ||
                  l.phase === "MEETING_DISCUSSION") && (
                  <section
                    className={`meeting-screen ${l.phase === "MEETING_INTRO" ? "intro" : ""}`}
                  >
                    <div className="alert-ribbon">
                      <span>⚠</span>
                      <h2>
                        EMERGENCY
                        <br />
                        MEETING
                      </h2>
                    </div>
                    <Hero emergency />
                    <h2 className="discuss">
                      {l.phase === "MEETING_INTRO"
                        ? "All hands on deck!"
                        : "Discuss!"}
                    </h2>
                    <p>
                      {l.players.find((p) => p.id === l.caller)?.name} called a
                      meeting.{" "}
                      {l.phase === "MEETING_DISCUSSION"
                        ? "Share what you saw."
                        : ""}
                    </p>
                    <Timer
                      now={now}
                      deadline={l.deadline}
                      total={
                        l.phase === "MEETING_INTRO" ? 3 : l.settings.discussion
                      }
                      label={
                        l.phase === "MEETING_INTRO"
                          ? "Discussion begins in"
                          : "Voting opens in"
                      }
                    />
                  </section>
                )}
                {l.phase === "MEETING_VOTING" && (
                  <>
                    <div className="vote-heading">
                      <h2>
                        {net.revealing
                          ? "Counting the votes…"
                          : "Who is the Impostor?"}
                      </h2>
                      <p>
                        {!me.alive
                          ? "Watch the crew decide."
                          : net.snapshot.myVote
                            ? "Your vote is in. Keep your poker face."
                            : "Trust your instincts. Choose carefully."}
                      </p>
                    </div>
                    <div className="player-list vote-list">
                      {l.players
                        .filter((p) => p.alive)
                        .map((p) => (
                          <PlayerRow
                            key={p.id}
                            p={p}
                            you={p.id === me.id}
                            onClick={
                              !net.revealing &&
                              me.alive &&
                              l.eligible.includes(me.id) &&
                              (!net.snapshot.myVote || l.settings.changes)
                                ? () => {
                                    setTarget(p.id);
                                    setModal("vote");
                                  }
                                : undefined
                            }
                          >
                            <span className="vote-status">
                              {net.snapshot.voted.includes(p.id)
                                ? "Voted"
                                : "Waiting"}
                            </span>
                            <span
                              className={`radio ${net.snapshot.myVote === p.id ? "checked" : ""}`}
                            />
                          </PlayerRow>
                        ))}
                    </div>
                    <div className="voting-bottom">
                      <Button
                        tone="subtle"
                        disabled={
                          net.revealing || !me.alive ||
                          !l.eligible.includes(me.id) ||
                          (!!net.snapshot.myVote && !l.settings.changes) ||
                          !net.connected
                        }
                        onClick={() => {
                          setTarget("skip");
                          setModal("vote");
                        }}
                      >
                        Skip Vote
                      </Button>
                      <span>
                        {net.snapshot.voted.length} / {l.eligible.length} votes
                        in
                      </span>
                    </div>
                    <Timer
                      now={now}
                      deadline={l.deadline}
                      total={l.settings.voting}
                      label="Voting ends in"
                    />
                    {net.snapshot.myVote && (
                      <div className="vote-locked">
                        <Icon name="check" />{" "}
                        {l.settings.changes
                          ? "Vote submitted. You may change it."
                          : "Vote locked. Waiting for the crew…"}
                      </div>
                    )}
                  </>
                )}
                {l.phase === "MEETING_RESULTS" && l.result && (
                  <>
                    <div className="result-reveal">
                      <span className="eyebrow">THE VERDICT IS IN</span>
                      {l.result.ejected ? (
                        <div className="ejected-avatar">
                          <Avatar
                            color={
                              l.players.find((p) => p.id === l.result!.ejected)
                                ?.color
                            }
                            size={130}
                          />
                        </div>
                      ) : (
                        <div className="no-ejection">✧</div>
                      )}
                      <h2>
                        {l.result.ejected
                          ? `${l.players.find((p) => p.id === l.result!.ejected)?.name} was ejected.`
                          : "No one was ejected."}
                      </h2>
                      <p>{l.result.reason}</p>
                    </div>
                    <section className="panel results-panel">
                      <div className="panel-heading">
                        <h2>Vote results</h2>
                        <span className="tiny-label">
                          {l.settings.anonymous ? "ANONYMOUS" : "PUBLIC"}
                        </span>
                      </div>
                      {Object.entries(l.result.counts).map(([id, count]) => (
                        <div className="result-row" key={id}>
                          <span>
                            {id === "skip"
                              ? "Skip"
                              : l.players.find((p) => p.id === id)?.name}
                          </span>
                          <div>
                            <i
                              style={{
                                width: `${(count / Math.max(1, l.eligible.length)) * 100}%`,
                              }}
                            />
                          </div>
                          <strong>{count}</strong>
                        </div>
                      ))}
                      <p className="hint">
                        {l.result.abstained ?? l.eligible.length - net.snapshot.voted.length}{" "}
                        abstained
                      </p>
                      {!l.settings.anonymous &&
                        Object.entries(l.votes).map(([id, v]) => (
                          <p className="public-vote" key={id}>
                            {l.players.find((p) => p.id === id)?.name} →{" "}
                            {v === "skip"
                              ? "Skip"
                              : l.players.find((p) => p.id === v)?.name}
                          </p>
                        ))}
                    </section>
                    {host ? (
                      <Button
                        onClick={() => send("CONTINUE")}
                        disabled={!net.connected}
                      >
                        Continue Game →
                      </Button>
                    ) : (
                      <p className="waiting-label">
                        Waiting for the host to continue…
                      </p>
                    )}
                  </>
                )}
                {l.phase === "GAME_ENDED" && (
                  <div className="ended-screen">
                    <div className="mini-crew">
                      {l.players.slice(0, 5).map((p) => (
                        <Avatar color={p.color} size={60} key={p.id} />
                      ))}
                    </div>
                    {title(
                      "THAT’S A WRAP",
                      "Good game, crew.",
                      "Same friends. A brand-new set of suspicions.",
                    )}
                    {host ? (
                      <>
                        <Button
                          disabled={!net.connected || connected < 4}
                          onClick={() => send("START")}
                        >
                          Play Again
                        </Button>
                        <Button
                          tone="subtle"
                          disabled={!net.connected}
                          onClick={() => send("RETURN")}
                        >
                          Return to Lobby
                        </Button>
                      </>
                    ) : (
                      <p>Waiting for the host to choose the next round.</p>
                    )}
                    <button
                      className="text-button"
                      onClick={() => setModal("leave")}
                    >
                      Leave Lobby
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <span>
          <span className="live-dot" /> BUILT FOR TOGETHER
        </span>
        <span>A fan-made companion. Let the real-world game begin.</span>
        <button onClick={() => setModal("about")}>
          How it works <span>↗</span>
        </button>
      </footer>
      {(net.error || net.notice) && (
        <div
          className={`toast ${net.error ? "error" : ""}`}
          role="status"
          onClick={() => room.clear()}
        >
          {net.error || net.notice}
          <Icon name="close" size={16} />
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === "player"
              ? "Edit crewmate"
              : modal === "menu"
                ? "Lobby controls"
                : modal === "device"
                  ? "Make yourself at home"
                  : modal === "settings"
                    ? "Game settings"
                    : modal === "transfer"
                      ? "Transfer host"
                      : modal === "vote"
                        ? target === "skip"
                          ? "Skip your vote?"
                          : `Vote for ${l?.players.find((p) => p.id === target)?.name}?`
                        : modal === "rename"
                          ? "Rename lobby"
                          : modal === "share"
                            ? "Invite your crew"
                            : modal === "alive"
                              ? "Manage your crew"
                              : modal === "edit-players"
                                ? "Edit players"
                                : modal === "about"
                                  ? "Same room. Same Wi-Fi."
                                  : modal === "emergency"
                                    ? "Call an emergency meeting?"
                                    : modal === "leave"
                                      ? "Leave the lobby?"
                                      : modal === "end-lobby"
                                        ? "End lobby for everyone?"
                                        : "End this game?"
          }
          onClose={() => setModal("")}
        >
          {modal === "menu" && (
            <div className="menu-list">
              {host && (
                <>
                  <button
                    onClick={() => {
                      setName(l!.name);
                      setModal("rename");
                    }}
                  >
                    <Icon name="edit" /> Rename lobby
                  </button>
                  {l?.phase === "LOBBY_WAITING" && (
                    <>
                      <button
                        onClick={() => {
                          setSettings(l.settings);
                          setModal("settings");
                        }}
                      >
                        <Icon name="settings" /> Game settings
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setTarget("");
                      setModal("transfer");
                    }}
                  >
                    <Icon name="crown" /> Transfer host
                  </button>
                  {l?.phase !== "LOBBY_WAITING" &&
                    l?.phase !== "GAME_ENDED" && (
                      <button onClick={() => setModal("end-game")}>
                        <Icon name="bolt" /> End game
                      </button>
                    )}
                </>
              )}
              <button onClick={() => setModal("leave")}>
                <Icon name="logout" /> Leave lobby
              </button>
              {host && (
                <button
                  className="danger-text"
                  onClick={() => setModal("end-lobby")}
                >
                  <Icon name="trash" /> End lobby
                </button>
              )}
            </div>
          )}
          {modal === "rename" && (
            <>
              <label>
                Lobby name
                <input
                  autoFocus
                  maxLength={40}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <Button
                disabled={!name.trim()}
                onClick={() => {
                  send("RENAME", { name });
                  setModal("");
                }}
              >
                Save name
              </Button>
            </>
          )}
          {modal === "transfer" && (
            <>
              <p>
                Choose a connected crewmate. The game continues with them in
                charge.
              </p>
              <div className="player-list">
                {l?.players
                  .filter((p) => p.connected && p.id !== me?.id)
                  .map((p) => (
                    <PlayerRow key={p.id} p={p} onClick={() => setTarget(p.id)}>
                      <span
                        className={`radio ${target === p.id ? "checked" : ""}`}
                      />
                    </PlayerRow>
                  ))}
              </div>
              {connected < 2 && <p>No other players are connected yet.</p>}
              <Button
                tone="blue"
                disabled={!target}
                onClick={() => {
                  send("TRANSFER", { playerId: target });
                  setModal("");
                }}
              >
                Transfer Host
              </Button>
            </>
          )}
          {modal === "alive" && (
            <>
              <p>Tap a player to toggle their alive / ejected status.</p>
              {l?.players.map((p) => (
                <PlayerRow
                  p={p}
                  key={p.id}
                  onClick={() => send("ALIVE", { playerId: p.id })}
                >
                  <span className="badge">{p.alive ? "ALIVE" : "EJECTED"}</span>
                </PlayerRow>
              ))}
            </>
          )}
          {modal === "settings" && (
            <>
              <label>
                Discussion duration
                <select
                  value={settings.discussion}
                  onChange={(e) =>
                    setSettings({ ...settings, discussion: +e.target.value })
                  }
                >
                  {[0, 15, 30, 60, 90, 120, 180].map((v) => (
                    <option value={v} key={v}>
                      {v === 0 ? "Immediate voting" : `${v} seconds`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Voting duration
                <select
                  value={settings.voting}
                  onChange={(e) =>
                    setSettings({ ...settings, voting: +e.target.value })
                  }
                >
                  {[15, 30, 45, 60, 90, 120].map((v) => (
                    <option value={v} key={v}>
                      {v} seconds
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  ["changes", "Allow vote changes"],
                  ["anonymous", "Anonymous vote results"],
                  ["early", "Finish when everyone has voted"],
                ] as const
              ).map(([k, label]) => (
                <label className="toggle-row" key={k}>
                  {label}
                  <input
                    type="checkbox"
                    checked={settings[k]}
                    onChange={(e) =>
                      setSettings({ ...settings, [k]: e.target.checked })
                    }
                  />
                </label>
              ))}
              <p className="hint">
                Uncast votes count as abstentions. Ties eject nobody.
              </p>
              <Button
                onClick={() => {
                  send("SETTINGS", { settings });
                  setModal("");
                }}
              >
                Save settings
              </Button>
            </>
          )}
          {modal === "device" && (
            <>
              {[
                ["sound", "Sound effects"],
                ["haptics", "Vibration"],
                ["motion", "Reduce animations"],
              ].map(([k, label]) => (
                <label className="toggle-row" key={k}>
                  {label}
                  <input
                    type="checkbox"
                    checked={prefs[k]}
                    onChange={(e) =>
                      setPrefs({ ...prefs, [k]: e.target.checked })
                    }
                  />
                </label>
              ))}
              {install ? (
                <Button
                  tone="blue"
                  onClick={() => {
                    install.prompt();
                    setInstall(null);
                  }}
                >
                  Install app
                </Button>
              ) : (
                <p className="hint">
                  To install, use your browser’s “Add to Home Screen” option.
                  Installation requires a secure connection.
                </p>
              )}
              <p className="hint">Preferences are saved on this device.</p>
            </>
          )}
          {modal === "share" && <Invite code={net.code} />}
          {modal === "about" && (
            <>
              <p>
                One person creates a lobby. Everyone else scans their invitation
                QR or enters the room code, then picks a name and color.
              </p>
              <p>
                Play your real-world game, call a meeting when something looks
                suspicious, then discuss and vote together.
              </p>
              <p>
                Keep the host’s app open. Game messages travel directly between
                your devices. The connection service helps everyone join and
                reconnect.
              </p>
            </>
          )}
          {["vote", "emergency", "leave", "end-lobby", "end-game"].includes(
            modal,
          ) && (
            <>
              <p>
                {modal === "vote"
                  ? l?.settings.changes
                    ? "You can change your vote until voting closes."
                    : "Your choice stays private until results. Once confirmed, your vote is locked."
                  : modal === "emergency"
                    ? "Every connected crewmate will be called into the discussion."
                    : modal === "leave"
                      ? "Your character will be released. Another connected crewmate takes over if you are host."
                      : modal === "end-lobby"
                        ? "This closes the session for everyone. You cannot undo this."
                        : "The current round will end. Your crew and lobby will stay together."}
              </p>
              <Button
                tone={modal === "vote" ? "blue" : "red"}
                disabled={!net.connected}
                onClick={() => {
                  send(
                    modal === "vote"
                      ? "VOTE"
                      : modal === "emergency"
                        ? "MEETING"
                        : modal === "leave"
                          ? "LEAVE"
                          : modal === "end-lobby"
                            ? "END_LOBBY"
                            : "END_GAME",
                    modal === "vote" ? { target } : {},
                  );
                  setModal("");
                }}
              >
                {modal === "vote"
                  ? "Confirm Vote"
                  : modal === "emergency"
                    ? "Call Meeting"
                    : modal === "leave"
                      ? "Leave Lobby"
                      : modal === "end-lobby"
                        ? "End Lobby"
                        : "End Game"}
              </Button>
              <Button tone="subtle" onClick={() => setModal("")}>
                Cancel
              </Button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
