set -eu
hostname
systemctl list-units --all --type=service --no-pager | rg -i 'cloudflare|tunnel|toolbox' || true
systemctl --user list-units --all --type=service --no-pager | rg -i 'cloudflare|tunnel|toolbox' || true
docker ps --format '{{.Names}} {{.Image}} {{.Ports}}' || true
ls -d /home/isaac/REPOS /etc/cloudflared /home/isaac/.cloudflared 2>/dev/null || true
for p in /AGENTS.md /home/AGENTS.md /home/isaac/AGENTS.md /home/isaac/REPOS/AGENTS.md; do
  if test -f "$p"; then cat "$p"; fi
done
ss -lnt | rg '8787|8788|5173' || true
