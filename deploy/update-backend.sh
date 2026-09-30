#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ssh_target="isaac@cachyos-x8664"
remote_root="/home/isaac/REPOS/imposter-signaling"
archive="$(mktemp "${TMPDIR:-/tmp}/imposter-backend.XXXXXX.tar.gz")"
archive_name=".deploy-$(basename "$archive")"
trap 'rm -f "$archive"' EXIT

for command in tar scp ssh; do
  command -v "$command" >/dev/null || { echo "Missing command: $command" >&2; exit 1; }
done

tar -czf "$archive" -C "$repo_root" \
  server/signaling.mjs \
  deploy/signaling/compose.yaml \
  deploy/signaling/Dockerfile \
  deploy/signaling/package.json \
  deploy/signaling/package-lock.json

echo "Uploading backend to $ssh_target..."
scp "$archive" "$ssh_target:$remote_root/$archive_name"

echo "Rebuilding backend on $ssh_target..."
ssh "$ssh_target" "set -eu; cd '$remote_root'; trap 'rm -f $archive_name' EXIT; tar -xzf '$archive_name'; docker compose -f deploy/signaling/compose.yaml config --quiet; docker compose -f deploy/signaling/compose.yaml up -d --build --wait; curl --fail --silent --show-error http://127.0.0.1:8788/healthz"
echo
echo "Backend deployment complete."
