#!/usr/bin/env bash

set -euo pipefail

postgres_container_name="games-local-postgres"
zero_container_name="games-local-zero-cache"
docker_network_name="games-local-dev"
postgres_volume_name="games-pg-data"
zero_volume_name="games-zero-data"
script_dir="$(cd "$(dirname "$0")" && pwd)"
root_dir="$(cd "$script_dir/.." && pwd)"

skip_docker=false
skip_db_push=false
skip_dev=false
skip_ports=false
preserve_db_data=false
use_host=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-docker)
      skip_docker=true
      ;;
    --skip-db-push)
      skip_db_push=true
      ;;
    --skip-dev)
      skip_dev=true
      ;;
    --skip-ports)
      skip_ports=true
      ;;
    --preserve-db-data)
      preserve_db_data=true
      ;;
    --host)
      use_host=true
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
  shift
done

assert_command_available() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command '$command_name' is not installed or not on PATH." >&2
    exit 1
  fi
}

assert_docker_running() {
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is installed but the daemon is not running." >&2
    echo "Start Docker Desktop, OrbStack, Colima, or another Docker daemon and try again." >&2
    exit 1
  fi
}

wait_for_port() {
  local host_name="$1"
  local port="$2"
  local timeout_seconds="${3:-60}"
  local elapsed=0

  while (( elapsed < timeout_seconds )); do
    if nc -z "$host_name" "$port" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  echo "Timed out waiting for ${host_name}:${port}" >&2
  exit 1
}

stop_listening_process() {
  local port="$1"
  local process_ids=""

  if command -v lsof >/dev/null 2>&1; then
    process_ids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  elif command -v fuser >/dev/null 2>&1; then
    process_ids="$(fuser "${port}/tcp" 2>/dev/null || true)"
  else
    echo "Cannot clear port ${port}: install lsof or fuser, or run local:down first." >&2
    return 0
  fi

  if [[ -z "$process_ids" ]]; then
    return 0
  fi

  while IFS= read -r process_id; do
    [[ -z "$process_id" ]] && continue
    [[ "$process_id" == "$$" ]] && continue

    local process_name
    process_name="$(ps -p "$process_id" -o comm= 2>/dev/null | xargs || true)"
    echo "Stopping process on port ${port} - ${process_name:-unknown} (${process_id})"
    kill "$process_id" >/dev/null 2>&1 || true
    sleep 1
    kill -9 "$process_id" >/dev/null 2>&1 || true
  done <<< "$process_ids"
}

stop_dev_ports() {
  echo "Clearing local dev ports 5173, 3002, 3001..."
  stop_listening_process 5173
  stop_listening_process 3002
  stop_listening_process 3001
}

get_dotenv_value() {
  local name="$1"
  local env_file="$root_dir/.env"

  [[ -f "$env_file" ]] || return 0
  grep -E "^[[:space:]]*${name}[[:space:]]*=" "$env_file" | tail -n 1 | sed -E "s/^[^=]+=//; s/^[\"']//; s/[\"']$//"
}

is_local_database_url() {
  local database_url="$1"
  [[ -z "$database_url" ]] && return 0
  [[ "$database_url" =~ @localhost(:|/) ]] && return 0
  [[ "$database_url" =~ @127\.0\.0\.1(:|/) ]] && return 0
  [[ "$database_url" =~ @\[::1\](:|/) ]] && return 0
  [[ "$database_url" =~ ^postgres://localhost(:|/) ]] && return 0
  [[ "$database_url" =~ ^postgres://127\.0\.0\.1(:|/) ]] && return 0
  return 1
}

push_local_db_schema() {
  local database_url="${DATABASE_URL:-}"
  if [[ -z "$database_url" ]]; then
    database_url="$(get_dotenv_value DATABASE_URL || true)"
  fi

  if [[ "$preserve_db_data" == false ]] && is_local_database_url "$database_url"; then
    echo "Auto-approving local Drizzle data-loss prompts."
    (cd "$root_dir/packages/shared" && bun run drizzle-kit push --force)
    return 0
  fi

  if ! is_local_database_url "$database_url"; then
    echo "DATABASE_URL does not point at a local database. Refusing to auto-approve schema changes." >&2
    echo "Run 'bun db:push' manually or rerun local-dev with --skip-db-push." >&2
    exit 1
  fi

  bun db:push
}

ensure_docker_network() {
  if ! docker network inspect "$docker_network_name" >/dev/null 2>&1; then
    docker network create "$docker_network_name" >/dev/null
  fi
}

ensure_postgres_volume() {
  if ! docker volume inspect "$postgres_volume_name" >/dev/null 2>&1; then
    docker volume create "$postgres_volume_name" >/dev/null
  fi
}

remove_zero_data_volume() {
  docker volume rm "$zero_volume_name" >/dev/null 2>&1 || true
}

container_exists() {
  local container_name="$1"
  docker container inspect "$container_name" >/dev/null 2>&1
}

container_is_running() {
  local container_name="$1"
  [[ "$(docker inspect -f '{{.State.Running}}' "$container_name" 2>/dev/null || true)" == "true" ]]
}

start_postgres_container() {
  ensure_docker_network
  ensure_postgres_volume

  if container_exists "$postgres_container_name"; then
    if ! container_is_running "$postgres_container_name"; then
      docker start "$postgres_container_name" >/dev/null
    fi
    return 0
  fi

  docker run -d \
    --name "$postgres_container_name" \
    --network "$docker_network_name" \
    -p 5432:5432 \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=games \
    -v "$postgres_volume_name":/var/lib/postgresql/data \
    postgres:16-alpine \
    postgres -c wal_level=logical >/dev/null
}

start_zero_container() {
  ensure_docker_network
  docker volume create "$zero_volume_name" >/dev/null
  docker rm -f "$zero_container_name" >/dev/null 2>&1 || true

  docker run -d \
    --name "$zero_container_name" \
    --network "$docker_network_name" \
    -p 4848:4848 \
    -e ZERO_UPSTREAM_DB=postgres://postgres:postgres@${postgres_container_name}:5432/games \
    -e ZERO_CVR_DB=postgres://postgres:postgres@${postgres_container_name}:5432/games \
    -e ZERO_CHANGE_DB=postgres://postgres:postgres@${postgres_container_name}:5432/games \
    -e ZERO_REPLICA_FILE=/data/zero.db \
    -e ZERO_ADMIN_PASSWORD=dev-password \
    -e ZERO_QUERY_URL=http://host.docker.internal:3001/api/zero/query \
    -e ZERO_MUTATE_URL=http://host.docker.internal:3001/api/zero/mutate \
    -v "$zero_volume_name":/data \
    rocicorp/zero:1.8.0 >/dev/null
}

echo "Checking required tools..."
if [[ "$skip_docker" == false ]]; then
  assert_command_available docker
  assert_docker_running
fi
if [[ "$skip_db_push" == false || "$skip_dev" == false ]]; then
  assert_command_available bun
fi
assert_command_available nc

if [[ "$skip_dev" == false && "$skip_ports" == false ]]; then
  stop_dev_ports
fi

if [[ "$skip_docker" == false ]]; then
  echo "Starting Postgres..."
  start_postgres_container

  echo "Waiting for Postgres on localhost:5432..."
  wait_for_port 127.0.0.1 5432 90
fi

if [[ "$skip_db_push" == false ]]; then
  echo "Pushing database schema..."
  push_local_db_schema
fi

if [[ "$skip_docker" == false ]]; then
  echo "Resetting zero-cache replica..."
  remove_zero_data_volume

  echo "Starting zero-cache (fresh replica)..."
  start_zero_container

  echo "Waiting for Zero cache on localhost:4848..."
  wait_for_port 127.0.0.1 4848 90
fi

if [[ "$skip_dev" == false ]]; then
  if [[ "$use_host" == true ]]; then
    echo "Starting local dev servers (exposed on network)..."
    export VITE_EXPOSE_HOST=1
  else
    echo "Starting local dev servers..."
  fi
  exec bun dev
fi
