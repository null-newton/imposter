# imp.zacsvae.com deployment

Prepared configuration; not yet deployed. The destination server and DNS access still need to be supplied.

This package runs one Node server and one shared lobby. It needs a host that supports long-running Node processes, WebSockets, and persistent storage. Static-only hosting cannot run the multiplayer server. Use exactly one app replica with the current file-backed state model.

## Docker server option

For a Linux server with Docker Compose and ports 80/443 available:

1. Copy this project to the server, excluding `node_modules`, `dist`, `.data*`, test results, and private credentials. The Docker build creates its own fresh production assets. Existing local games and device tokens are not uploaded.
2. In Cloudflare DNS, create an `A` record named `imp` pointing to that server's public IPv4 address. Start with DNS-only mode while verifying the origin certificate. Only add an `AAAA` record if the server has working public IPv6.
3. From the project folder, run `docker compose up -d --build`.
4. Inspect `docker compose ps` and `docker compose logs --tail=100 app caddy`. Open `https://imp.zacsvae.com` and verify four devices can join, reserve colors, start a game, and vote.

The Caddy configuration handles HTTPS and proxies `/room` WebSocket connections to the app. Named volumes preserve lobby state and TLS certificate data. Do not remove those volumes when updating. Deploy an update with `docker compose up -d --build`; the server restarts, and clients reconnect to its persisted session. Schedule updates between games when possible.

If the server already has a reverse proxy on ports 80/443, integrate the app into that proxy instead of starting the included Caddy service. The app listens on port 5173 internally, and its persistent directory is `/app/data`.

## Hosting-provider option

The `Dockerfile` can also be used by a container hosting provider. Set its listening port to 5173, attach a persistent disk at `/app/data` writable by UID 1000, run one replica, and disable idle suspension for uninterrupted sessions. Add `imp.zacsvae.com` as a custom domain and use the DNS records provided by that host. The provider can terminate HTTPS instead of Caddy.

The site currently uses one shared lobby across every visitor to its public address. Public hosting does not restrict discovery to a Wi-Fi network. This remains a casual crew companion, without accounts or room access codes.

The Docker configuration has not been executed locally because Docker is not installed in the development environment. The existing TypeScript production build and browser multiplayer tests are separate from deployment validation.

References: [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https), [WebSocket reverse proxy support](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [persistent Compose volumes](https://docs.docker.com/reference/compose-file/volumes/).
