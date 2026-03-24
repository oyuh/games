#!/usr/bin/env bash

set -euo pipefail

postgres_container_name="games-local-postgres"
zero_container_name="games-local-zero-cache"
docker_network_name="games-local-dev"
zero_volume_name="games-zero-data"

skip_docker=false
skip_ports=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-docker)
      skip_docker=true
      ;;
    --skip-ports)
      skip_ports=true
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
  shift
done

stop_listening_process() {
  local port="$1"
  local process_ids

  process_ids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$process_ids" ]]; then
    return 0
  fi

  while IFS= read -r process_id; do
    [[ -z "$process_id" ]] && continue
    local process_name
    process_name="$(ps -p "$process_id" -o comm= 2>/dev/null | xargs || true)"
    echo "Stopping process on port ${port} - ${process_name:-unknown} (${process_id})"
    kill "$process_id" >/dev/null 2>&1 || true
    sleep 1
    kill -9 "$process_id" >/dev/null 2>&1 || true
  done <<< "$process_ids"
}

docker_is_running() {
  docker info >/dev/null 2>&1
}

remove_zero_data_volume() {
  echo "Removing zero-cache replica volume..."
  docker volume rm "$zero_volume_name" >/dev/null 2>&1 || true
}

if [[ "$skip_ports" == false ]]; then
  echo "Stopping local dev processes on ports 5173, 3002, 3001..."
  stop_listening_process 5173
  stop_listening_process 3002
  stop_listening_process 3001
fi

if [[ "$skip_docker" == false ]]; then
  echo "Stopping Docker services..."
  if docker_is_running; then
    docker rm -f "$zero_container_name" >/dev/null 2>&1 || true
    docker rm -f "$postgres_container_name" >/dev/null 2>&1 || true
    docker network rm "$docker_network_name" >/dev/null 2>&1 || true
    remove_zero_data_volume
  else
    echo "Docker daemon is not running, skipping container shutdown."
  fi
fi

echo "Local development services stopped."
