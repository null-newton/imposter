#!/usr/bin/env bash
set -euo pipefail
cd /home/isaac/REPOS/imposter-signaling
docker compose -f deploy/signaling/compose.yaml up -d --build
for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:8788/healthz; then break; fi
  sleep 2
done
curl --fail --silent http://127.0.0.1:8788/healthz
tunnel_id=$(cloudflared tunnel list --output json | python3 -c 'import json,sys; print(next((t["id"] for t in json.load(sys.stdin) if t["name"]=="imp-signaling"),""))')
if [ -z "$tunnel_id" ]; then
  cloudflared tunnel create imp-signaling
  tunnel_id=$(cloudflared tunnel list --output json | python3 -c 'import json,sys; print(next(t["id"] for t in json.load(sys.stdin) if t["name"]=="imp-signaling"))')
fi
[[ "$tunnel_id" =~ ^[a-f0-9-]{36}$ ]]
test -r "$HOME/.cloudflared/$tunnel_id.json"
cat > deploy/signaling/tunnel.yml <<EOF
tunnel: $tunnel_id
credentials-file: /etc/cloudflared/credentials.json
ingress:
  - hostname: imp-signal.zacsvae.com
    service: http://127.0.0.1:8788
  - service: http_status:404
EOF
cloudflared tunnel route dns "$tunnel_id" imp-signal.zacsvae.com
if docker container inspect imp-signaling-tunnel >/dev/null 2>&1; then
  docker restart imp-signaling-tunnel
else
  docker run -d --name imp-signaling-tunnel --restart unless-stopped --network host \
    --user "$(id -u):$(id -g)" --read-only --cap-drop ALL --security-opt no-new-privileges:true \
    --mount "type=bind,src=$PWD/deploy/signaling/tunnel.yml,dst=/etc/cloudflared/config.yml,readonly" \
    --mount "type=bind,src=$HOME/.cloudflared/$tunnel_id.json,dst=/etc/cloudflared/credentials.json,readonly" \
    cloudflare/cloudflared:2026.9.3 tunnel --config /etc/cloudflared/config.yml --no-autoupdate run
fi
docker compose -f deploy/signaling/compose.yaml ps
docker ps --filter name=imp-signaling-tunnel --format '{{.Names}} {{.Status}}'
