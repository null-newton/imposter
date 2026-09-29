# Among Us · Meeting Room

A mobile-first, local multiplayer companion for in-person games. React + TypeScript + Vite, with an Express/WebSocket room server. No accounts or external multiplayer service.

## Run

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. The terminal also prints the computer’s Wi-Fi address. **Every phone must open that same address**, on the same network. Permit inbound port 5173 in the computer’s firewall if needed. Keep this computer awake while playing. Guest Wi-Fi client isolation may prevent connection.

```sh
npm test
npm run build
npm start
```

`npm start` serves the production build. `PORT` overrides 5173. Do not expose the server to the public internet; this is a trusted LAN party tool, not a hardened public service.

## Install on phones / offline shell

Service workers and installation require HTTPS (localhost is an exception only on the computer itself). Plain HTTP LAN addresses support live play but cannot provide a full installable/offline PWA. To install on real phones, use a certificate trusted by every participating device, then set `TLS_KEY` and `TLS_CERT` to the PEM file paths before starting the server. The server serves HTTPS and secure WebSockets on the same port. On iOS use Share → Add to Home Screen. Android uses the browser install action. Icons, manifest and the built JS/CSS shell are cached after the first secure production visit. An offline launch shows a reconnection banner; multiplayer requires reaching the room server.

## Try four devices on one computer

Open four browser tabs:

- `http://localhost:5173/?device=red`
- `http://localhost:5173/?device=blue`
- `http://localhost:5173/?device=green`
- `http://localhost:5173/?device=yellow`

Each query value gets its own persistent device identity. Create a lobby in one tab, enter your name, and select a color. Other tabs join with their own names and colors. The normal URL uses one persistent device identity; duplicate normal tabs share a character, and closing one does not disconnect the others. There are no simulated players in the normal app.

Start requires four connected players. Set discussion to immediate voting in host settings for quick testing. Close the host tab, wait roughly 8 seconds, and observe the next connected character become host. A silently lost connection can take up to 23 seconds (heartbeat expiry plus grace). Reopen the exact device URL: its character and vote return, but host authority stays with the replacement. Refreshing within the grace period preserves authority.

The host creates an empty lobby and then chooses only their own name and color. Every guest does the same. Selecting a color reserves it immediately across all devices, before joining; other pickers see “Being chosen.” Switching colors, backing out, or disconnecting beyond the grace period releases an unfinished reservation. Confirmed players keep their colors through temporary disconnects. Only confirmed, connected players count toward the four-player minimum. The roster supports up to 15 players and has no host-managed placeholders.

## Architecture and rules

- `server/game.ts`: explicit authoritative state machine, claim validation, host election, settings, meeting deadlines and vote calculation.
- `server/index.ts`: same-origin discovery and WebSocket transport, token authentication, heartbeats, duplicate-tab handling and atomic session persistence in `.data/session.json`.
- `src/transport.ts`: replaceable transport interface; persistent random identity and server-issued reconnect token; reconnection, authoritative snapshots and server clock offset.
- `src/shared.ts`: shared domain types.
- `src/components.tsx`: reusable visual components and accessible dialog.
- `src/App.tsx`: UI flows and device preferences.
- `public/sw.js`: production offline app shell.

Browsers cannot scan arbitrary LAN devices. Discovery here means finding the one active lobby at the app’s shared origin. The server stays independent of the player host and is the single authority, preventing split-brain host elections. The host is a transferable game-control role. Election orders connected players by join order, then device ID. Disconnected players retain character ownership until they explicitly leave. Returning original hosts never displace a current connected host. Host epochs and state versions increase monotonically. Stale game-control actions are rejected and refreshed. Color reservations and joins are checked atomically against current availability, so independent simultaneous selections do not invalidate each other; lobby IDs and host epochs are still checked. Clients do not upload state snapshots. Session state and opaque bearer tokens are stored locally by the server; keep `.data` private.

Votes are omitted from all clients’ snapshots until results (and remain omitted when anonymous results are enabled). Only submitted status and a device’s own vote are exposed during voting. Eligibility is frozen at meeting start, including claimed disconnected players, so they have until the authoritative deadline to return. Missing votes abstain; a tie for first or a winning skip ejects nobody. Ejected players remain connected and can watch but cannot vote. Voting can end early when all eligible votes arrive. Only players who actually joined are included in the roster.

The server persists meetings, identities and deadlines across restarts. Players are marked disconnected on restart and restored by reconnecting sockets. Deadlines continue in wall-clock time; an elapsed meeting catches up after restart. If the server computer goes down, clients retain the visible session and reconnect when it returns; another phone cannot replace the infrastructure server.

## Validation

`npm test` covers empty-lobby creation, personal names, concurrent color reservations, reservation release, duplicate joins, stale versions/epochs, permissions, minimum crew, reconnects, host migration/return, manual transfer, meeting deadlines, private votes, duplicate vote protection, host loss mid-meeting, vote timeout, ties, ejection and reset.

The browser checks use installed Microsoft Edge. Start an isolated production server in a separate PowerShell terminal:

```powershell
npm run build
$env:PORT = '5175'
$env:DATA_DIR = '.data-test-pwa'
npm start
```

Then run `node tests/browser.mjs` and `node tests/offline.mjs`. The first exercises four independent mobile clients, synchronized voting/ejection, host migration and reconnection, and captures screenshots in `test-results`. It resets only the isolated test lobby on port 5175. The second checks manifest icons and reloads the cached production shell without a network. Both checks passed in desktop Edge with mobile viewport emulation; this does not substitute for testing physical phones.

Real phone acceptance: connect four phones, create/join, install using trusted HTTPS, start a meeting, submit votes, lock the host phone, wait for migration, reopen it, and repeat. Mobile browser background suspension and Wi-Fi behavior should be checked on your target iOS/Android devices.

Fan-made companion, not affiliated with Innersloth. Avatars and space artwork are drawn as local SVG/CSS; fonts have system fallbacks when offline.
