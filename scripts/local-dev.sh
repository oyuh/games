#!/usr/bin/env bash

set -euo pipefail

postgres_container_name="games-local-postgres"
zero_container_name="games-local-zero-cache"
docker_network_name="games-local-dev"
postgres_volume_name="games-pg-data"
zero_volume_name="games-zero-data"

skip_docker=false
skip_db_push=false
skip_dev=false
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
    rocicorp/zero:1.2.0 >/dev/null
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

if [[ "$skip_docker" == false ]]; then
  echo "Starting Postgres..."
  start_postgres_container

  echo "Waiting for Postgres on localhost:5432..."
  wait_for_port 127.0.0.1 5432 90
fi

if [[ "$skip_db_push" == false ]]; then
  echo "Pushing database schema..."
  bun db:push
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
