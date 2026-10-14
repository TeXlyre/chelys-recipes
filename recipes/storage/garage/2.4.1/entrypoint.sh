#!/bin/sh
# recipes/storage/garage/2.4.1/entrypoint.sh
set -eu

STATE_DIR=/var/lib/garage
STATE_FILE="$STATE_DIR/storage.env"
CONFIG_FILE="$STATE_DIR/garage.toml"

mkdir -p "$STATE_DIR/meta" "$STATE_DIR/data"

random_hex() {
  node -e "process.stdout.write(require('node:crypto').randomBytes($1).toString('hex'))"
}

random_base64() {
  node -e "process.stdout.write(require('node:crypto').randomBytes($1).toString('base64'))"
}

if [ ! -f "$STATE_FILE" ]; then
  ACCESS_KEY="GK$(random_hex 16)"
  SECRET_KEY="$(random_hex 32)"
  RPC_SECRET="$(random_hex 32)"
  ADMIN_TOKEN="$(random_base64 32)"
  METRICS_TOKEN="$(random_base64 32)"

  umask 077
  cat > "$STATE_FILE" <<EOF
GARAGE_ACCESS_KEY=$ACCESS_KEY
GARAGE_SECRET_KEY=$SECRET_KEY
GARAGE_RPC_SECRET=$RPC_SECRET
GARAGE_ADMIN_TOKEN=$ADMIN_TOKEN
GARAGE_METRICS_TOKEN=$METRICS_TOKEN
STORAGE_PREFIX_SECRET=$(random_hex 32)
EOF
fi

# Existing installations retain their Garage keys and receive new random secrets.
# These secrets must be backed up with storage.env to preserve access after upgrades.
umask 077
if ! grep -q '^STORAGE_PREFIX_SECRET=' "$STATE_FILE"; then
  printf 'STORAGE_PREFIX_SECRET=%s\n' "$(random_hex 32)" >> "$STATE_FILE"
fi
# shellcheck disable=SC1090
. "$STATE_FILE"

if [ ! -f "$CONFIG_FILE" ]; then
  umask 077
  cat > "$CONFIG_FILE" <<EOF
metadata_dir = "$STATE_DIR/meta"
data_dir = "$STATE_DIR/data"
db_engine = "sqlite"

replication_factor = 1

rpc_bind_addr = "127.0.0.1:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "$GARAGE_RPC_SECRET"

[s3_api]
s3_region = "${GARAGE_S3_REGION:-garage}"
api_bind_addr = "127.0.0.1:3900"
root_domain = ".s3.garage.localhost"

[admin]
api_bind_addr = "127.0.0.1:3903"
admin_token = "$GARAGE_ADMIN_TOKEN"
metrics_token = "$GARAGE_METRICS_TOKEN"
EOF
fi

export GARAGE_DEFAULT_ACCESS_KEY="$GARAGE_ACCESS_KEY"
export GARAGE_DEFAULT_SECRET_KEY="$GARAGE_SECRET_KEY"
export GARAGE_DEFAULT_BUCKET="${GARAGE_BUCKET:-texlyre-storage}"
export GARAGE_ACCESS_KEY GARAGE_SECRET_KEY STORAGE_PREFIX_SECRET

/usr/local/bin/garage server --single-node --default-bucket &
garage_pid=$!
bridge_pid=

cleanup() {
  if [ -n "${bridge_pid:-}" ]; then
    kill "$bridge_pid" 2>/dev/null || true
  fi
  kill "$garage_pid" 2>/dev/null || true
  wait "$garage_pid" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

attempt=0
until /usr/local/bin/garage bucket info "$GARAGE_DEFAULT_BUCKET" >/dev/null 2>&1; do
  if ! kill -0 "$garage_pid" 2>/dev/null; then
    wait "$garage_pid"
    exit $?
  fi
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "Garage did not become ready" >&2
    exit 1
  fi
  sleep 0.5
done

node /opt/texlyre-storage/bridge.cjs &
bridge_pid=$!
wait "$bridge_pid"
