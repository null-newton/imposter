# Meeting Room

A mobile PWA for in-person games. The host creates a room and chooses their own name and color; guests scan one invitation QR or enter the room code, then choose theirs. Colors reserve live. Four connected players unlock Start Game.

## Production

- Frontend: https://imp.zacsvae.com — GitHub Pages, repository null-newton/imposter.
- Connection service: wss://imp-signal.zacsvae.com/signal — Node on the CachyOS laptop through a dedicated Cloudflare Tunnel.
- Health: https://imp-signal.zacsvae.com/healthz.

The signaling service is deployed separately from toolbox-backend and the existing filesrv tunnel. The service stores only room membership, hashed reconnect credentials and host epochs. Names, color selections, game events and votes travel directly over WebRTC data channels. The website needs its GitHub Pages workflow deployed to serve the new client.

## Local development

Use Node 24 or newer. In two terminals:

```sh
npm ci
npm run signal
```

```sh
npm run dev
```

Open http://localhost:5173. The local signal service listens on 127.0.0.1:8788. A production build uses wss://imp-signal.zacsvae.com/signal unless VITE_SIGNAL_URL is set at build time. Do not put credentials in VITE_ variables: they are public frontend configuration.

```sh
npm test
npm run build
npm start
```

Use separate browser profiles or ?device=red, ?device=blue, etc. to simulate distinct persistent devices. Ordinary duplicate tabs are detected and the second tab is asked to use the original one. A normal refresh restores the device identity and reconnects automatically.

## GitHub Pages

The workflow at .github/workflows/deploy.yml runs unit/integration tests, builds Vite, and deploys dist on pushes to main/master. In repository Settings → Pages, choose GitHub Actions as the source, set the custom domain to imp.zacsvae.com, and enable HTTPS. The imp DNS CNAME must point to null-newton.github.io. The repository variable VITE_SIGNAL_URL is optional; its fallback is the deployed signaling URL above. This build targets the custom domain root, not a /imposter subdirectory.

## Multiplayer behavior

- A room code identifies one crew. There is no automatic Wi-Fi scanning and no global lobby visible to every visitor. QR links contain the room code, never a reconnect token.
- The connection service authenticates persistent devices, relays WebRTC connection descriptions, and chooses a single host with an increasing epoch. It keeps that role stable when an original host returns.
- Every device connects directly to its peers. The host runs the game state machine and distributes snapshots. Other devices cache those snapshots so the next host can restore the latest available state.
- A disconnected host is replaced after a grace period. Heartbeat detection can take around 10–25 seconds, followed by a short state-recovery pause. The signaling service must be reachable for host changes and new connections.
- During voting, devices send salted SHA-256 commitments instead of readable choices. Once voting closes, devices reveal their saved ballots to the host. Results appear after all committed votes are received or a five-second reveal grace period ends. A device that stays offline through that deadline abstains, even if it previously committed a vote. Returning before the deadline restores its saved ballot.
- State-changing requests are checked against the lobby, authority epoch, phase and player ownership. Color claims are serialized by the host, preventing simultaneous overlap. This is a trusted party-game companion, not a cheat-proof competitive protocol; a modified host client can falsify state.
- Explicitly leaving releases the player in the waiting room. Temporarily disconnecting reserves the existing character for reconnection.

## Network limits

WebRTC uses local ICE candidates only; there is no STUN or TURN service and no gameplay relay. Use the same Wi-Fi, with client isolation disabled. This avoids depending on an additional relay but cannot guarantee connectivity on every router or browser. A room code does not cryptographically prove that users share a Wi-Fi network. Physical iOS/Android testing remains necessary.

Keep participating apps in the foreground when possible. Mobile operating systems may suspend background tabs. Existing direct connections can continue through a short signaling outage, but new joins, host election and rebuilding connections require the laptop/tunnel. Game snapshots are saved on players’ devices, not on the laptop; clearing every device’s storage loses the game.

## PWA and tests

HTTPS allows home-screen installation, camera scanning and offline shell loading. The production service worker caches the shell and built assets. Offline loading does not create a new room without the connection service.

npm test covers game transitions, reservations, duplicate claims, reconnects, host migration, voting, privacy commitments and signaling room isolation. npm run test:browser exercises four actual browser/WebRTC clients against a local static preview and signal service; it tests a decoded invitation QR, room codes, voting, host loss during voting, ballot recovery and manual transfer. It asserts that gameplay messages never use the signaling WebSocket. npm run test:offline checks cached shell loading. See deploy/README.md for setup and operations.

Fan-made companion, not affiliated with Innersloth.
