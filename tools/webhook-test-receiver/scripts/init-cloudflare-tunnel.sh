#!/usr/bin/env sh
# Creates one locally managed named Cloudflare Tunnel and writes ignored credential/config files.

set -eu

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  printf 'Usage: %s <public-hostname> [tunnel-name]\n' "$0" >&2
  exit 2
fi

HOSTNAME=$1
TUNNEL_NAME=${2:-framerfordevs-wb-test}
IMAGE=cloudflare/cloudflared:2026.8.2
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
AUTHORITY_DIR="$ROOT/cloudflared"
UID_VALUE=$(id -u)
GID_VALUE=$(id -g)

case "$HOSTNAME" in
  *[!A-Za-z0-9.-]*|.*|*.)
    printf 'The public hostname is invalid.\n' >&2
    exit 2
    ;;
esac

mkdir -p "$AUTHORITY_DIR"
chmod 700 "$AUTHORITY_DIR"
if find "$AUTHORITY_DIR" -maxdepth 1 -name '*.json' -print -quit | grep -q .; then
  printf 'A tunnel credential already exists; refusing to overwrite it.\n' >&2
  exit 1
fi

printf 'Cloudflare will open an interactive browser authorization flow.\n'
docker run --rm -it \
  --user "$UID_VALUE:$GID_VALUE" \
  -v "$AUTHORITY_DIR:/home/nonroot/.cloudflared" \
  "$IMAGE" tunnel login

docker run --rm \
  --user "$UID_VALUE:$GID_VALUE" \
  -v "$AUTHORITY_DIR:/home/nonroot/.cloudflared" \
  "$IMAGE" tunnel create "$TUNNEL_NAME"

CREDENTIAL=$(find "$AUTHORITY_DIR" -maxdepth 1 -name '*.json' -print -quit)
if [ -z "$CREDENTIAL" ]; then
  printf 'Cloudflare did not create a tunnel credential.\n' >&2
  exit 1
fi
TUNNEL_ID=$(basename "$CREDENTIAL" .json)

docker run --rm \
  --user "$UID_VALUE:$GID_VALUE" \
  -v "$AUTHORITY_DIR:/home/nonroot/.cloudflared" \
  "$IMAGE" tunnel route dns "$TUNNEL_NAME" "$HOSTNAME"

cat > "$AUTHORITY_DIR/config.yml" <<EOF
tunnel: $TUNNEL_ID
credentials-file: /etc/cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $HOSTNAME
    service: http://receiver:8787
  - service: http_status:404
EOF
chmod 600 "$CREDENTIAL" "$AUTHORITY_DIR/config.yml" "$AUTHORITY_DIR/cert.pem"
printf 'Named tunnel configured. Start it with: docker compose up -d --build\n'
