# Deployment and operations

## Installed on the CachyOS laptop

SSH: isaac@cachyos-x8664

Service files: /home/isaac/REPOS/imposter-signaling

- Docker Compose project: imp-signaling
- Container: imp-signaling-signaling-1
- Host listener: 127.0.0.1:8788
- Persistent metadata: Docker volume imp-signaling_imp-signal-data
- Tunnel: imp-signaling (f5c2b04d-1c68-499e-a5e9-c29c3d23469f)
- Tunnel container: imp-signaling-tunnel
- Public hostname: imp-signal.zacsvae.com
- Connection endpoint: wss://imp-signal.zacsvae.com/signal
- Health endpoint: https://imp-signal.zacsvae.com/healthz

Both containers use restart: unless-stopped. This does not depend on user login/linger. Docker must start at boot and the laptop must remain powered on. Existing toolbox-backend.service, cloudflared-filesrv.service and the api/cine/files hostnames were not modified.

The tunnel credentials stay in /home/isaac/.cloudflared on the laptop and are mounted read-only. They are not copied into this repository. The generated tunnel configuration is also excluded from Git.

## Inspect and update

```sh
cd /home/isaac/REPOS/imposter-signaling
docker compose -f deploy/signaling/compose.yaml ps
docker compose -f deploy/signaling/compose.yaml logs --tail=100
docker logs --tail=100 imp-signaling-tunnel
curl --fail https://imp-signal.zacsvae.com/healthz
```

From the project root on Windows, run:

```powershell
.\deploy\update-backend.ps1
```

On Linux, run:

```sh
bash ./deploy/update-backend.sh
```

Both scripts deploy the backend files from the current local checkout to the CachyOS laptop, rebuild the Docker service, and check its local health endpoint. OpenSSH prompts in the terminal if a password is required; the scripts do not store it. The frontend is published separately through GitHub Pages. To update the backend manually, copy `server/signaling.mjs` and the Docker build files in `deploy/signaling`, then run:

```sh
docker compose -f deploy/signaling/compose.yaml up -d --build
```

Keep the metadata volume. Clients reconnect after a service restart. Schedule updates between games. The service allows the production site plus localhost development on ports 5173 and 5175. Game state never lives in this Docker volume.

The install-user.sh script documents initial installation using the existing user's Cloudflare account certificate. It creates a dedicated tunnel and DNS record only for imp-signal.zacsvae.com. It does not edit the root-owned filesrv tunnel. Do not start another connector for filesrv with this app's ingress rules.

## Frontend publication

Push this project to null-newton/imposter. In Settings → Pages, select GitHub Actions. The included workflow builds and uploads dist, not the source folder. Keep imp.zacsvae.com as the custom domain and enable HTTPS. The imp CNAME already points to null-newton.github.io.

Optional Actions variable:

```text
VITE_SIGNAL_URL=wss://imp-signal.zacsvae.com/signal
```

The same value is the build fallback; it is independent of the toolbox repository's VITE_FUNCTIONS_URL setting.

## Browser verification

In one terminal run npm run signal. In another, build a local-endpoint preview:

```powershell
$env:VITE_SIGNAL_URL = 'ws://localhost:8788/signal'
npm run build
npx vite preview --port 5175
```

Then npm run test:browser and npm run test:offline. These tests use installed Microsoft Edge. Screenshots are saved under test-results. node tests/live-signal.mjs checks public HTTPS/WSS with a temporary room and removes that room afterward.

Physical phones should scan the host invitation from https://imp.zacsvae.com, on the same Wi-Fi. Test host suspension/reconnection and a complete vote on target iOS/Android versions before relying on a particular router/browser combination.
