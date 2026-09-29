set -eu
systemctl show cloudflared-filesrv.service -p FragmentPath -p User
ls -la /etc/cloudflared /home/isaac/.cloudflared
for p in /etc/cloudflared/config.yml /etc/cloudflared/config.yaml /home/isaac/.cloudflared/config.yml; do
  if test -r "$p"; then
    echo "$p"
    rg 'hostname:|service:' "$p" || true
  fi
done
sudo -n true && echo SUDO_AVAILABLE || true
ss -lnt | rg ':8788 ' || true
exit 0
