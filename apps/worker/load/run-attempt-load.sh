#!/usr/bin/env bash
# Runs controlled-TLS attempt profiles in an isolated root-capable container on HTTPS port 443.
set -euo pipefail

profile="${1:-all}"
case "$profile" in
  all|healthy_fanout|single_endpoint|slow_isolation|retry_storm) ;;
  *) exit 1 ;;
esac

directory="$(mktemp -d)"
cleanup() {
  rm -rf "$directory"
}
trap cleanup EXIT

cat >"$directory/openssl.cnf" <<'EOF'
[req]
distinguished_name=dn
x509_extensions=ext
prompt=no
[dn]
CN=hooks.example.com
[ext]
subjectAltName=DNS:hooks.example.com,DNS:*.example.com
basicConstraints=critical,CA:TRUE
keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign
extendedKeyUsage=serverAuth
EOF
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 1 \
  -keyout "$directory/key.pem" -out "$directory/certificate.pem" \
  -config "$directory/openssl.cnf" >/dev/null 2>&1
chmod 600 "$directory/key.pem" "$directory/certificate.pem"

docker compose build server >/dev/null
profiles=(healthy_fanout single_endpoint slow_isolation retry_storm)
if [[ "$profile" != "all" ]]; then
  profiles=("$profile")
fi
for selected in "${profiles[@]}"; do
  docker compose run --rm --no-deps \
    -v "$directory:/run/m11-webhook-tls:ro" \
    -e WEBHOOK_LOAD_TLS_KEY_PATH=/run/m11-webhook-tls/key.pem \
    -e WEBHOOK_LOAD_TLS_CERTIFICATE_PATH=/run/m11-webhook-tls/certificate.pem \
    server pnpm --dir /app/packages/api exec tsx src/scripts/webhook/attempt-load.ts "$selected"
done
