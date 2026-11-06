#!/usr/bin/env bash
# Flip the enforcing CSP on or off for the live container.
#
# Why this exists as a script instead of "just add -e CSP_ENFORCE=1 to the
# deploy": the flip is a runtime decision (does the evidence justify blocking
# yet?), and it must be reversible in the same breath. Rolling back a deploy is
# slow; rolling back a policy should be one command.
#
# The container name matters more than it looks: the tailscale funnel points at
# http://skopein-signal-vNN:3000, so renaming the container takes the site down
# with a 502. The renewal therefore reuses the exact same name.
#
#   csp-mode.sh              # report current mode
#   csp-mode.sh enforce      # block with the full policy
#   csp-mode.sh report-only  # back to observing
#
# Health is checked before the switch is considered done; if the new container
# is not answering locally within 40s it is torn down and the old config is
# restored from /var/lib/skopein/csp-mode.previous.
set -euo pipefail

NAME=${NAME:-skopein-signal-v78}
TARGET=${1:-status}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-40}

cur_mode() {
  if docker exec "$NAME" printenv CSP_ENFORCE 2>/dev/null | grep -qx 1; then echo enforce; else echo report-only; fi
}

case "$TARGET" in
  status|"")
    [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" = true ] || { echo "container $NAME is not running" >&2; exit 1; }
    echo "mode: $(cur_mode)   image: $(docker inspect -f '{{.Config.Image}}' "$NAME")"
    echo "header: $(curl -s -D- -o /dev/null http://127.0.0.1:3000/ | grep -io '^content-security-policy[a-z-]*' | head -1)"
    exit 0
    ;;
  enforce) WANT=1 ;;
  report-only) WANT=0 ;;
  *) echo "usage: $0 [status|enforce|report-only]" >&2; exit 2 ;;
esac

[ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" = true ] || { echo "container $NAME is not running" >&2; exit 1; }
BEFORE=$(cur_mode)
[ "$BEFORE" = enforce ] && [ "$WANT" = 1 ] && { echo "already enforcing, nothing to do"; exit 0; }
[ "$BEFORE" = report-only ] && [ "$WANT" = 0 ] && { echo "already report-only, nothing to do"; exit 0; }

IMAGE=$(docker inspect -f '{{.Config.Image}}' "$NAME")
PORTS=$(docker inspect -f '{{range $p, $b := .HostConfig.PortBindings}}{{range $b}}{{.HostIp}}:{{.HostPort}}->{{$p}} {{end}}{{end}}' "$NAME")
NETWORK=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$NAME")
MOUNTS=$(docker inspect -f '{{range .Mounts}}-v {{.Source}}:{{.Destination}} {{end}}' "$NAME")
HOSTS=$(docker inspect -f '{{range .HostConfig.ExtraHosts}}--add-host {{.}} {{end}}' "$NAME")
RESTART=$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$NAME")

# Every env var except CSP_ENFORCE, quoted for safe re-use.
mapfile -t ENVS < <(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$NAME" | grep -v '^CSP_ENFORCE=' | grep -v '^$' || true)

save_previous() {
  {
    echo "name=$NAME"; echo "image=$IMAGE"; echo "ports=$PORTS"; echo "network=$NETWORK"
    echo "mounts=$MOUNTS"; echo "hosts=$HOSTS"; echo "restart=$RESTART"
    printf 'env=%s\n' "${ENVS[@]}"
  } > /var/lib/skopein/csp-mode.previous
}
save_previous

run_container() { # $1 = name, $2 = 1|0 enforce, $3 = publish ports (1|0)
  local name=$1 want=$2 publish=$3
  local args=() portargs=() m
  # Hardcoded on purpose: parsing "0.0.0.0:3000->3000/tcp" back into a -p spec is
  # where this script broke the first time ("invalid containerPort"). The public
  # port of this site is not a variable worth generalising.
  if [ "$publish" = 1 ]; then portargs=(-p 3000:3000); fi
  for m in "${ENVS[@]}"; do args+=(-e "$m"); done
  [ "$want" = 1 ] && args+=(-e CSP_ENFORCE=1)
  # shellcheck disable=SC2086
  docker run -d --name "$name" --network "$NETWORK" --restart "$RESTART" \
    "${portargs[@]}" $HOSTS $MOUNTS "${args[@]}" "$IMAGE" >/dev/null
}

wait_health() { # $1 = container name
  local name=$1 i
  for i in $(seq 1 "$HEALTH_TIMEOUT"); do
    if docker exec "$name" node -e 'fetch("http://127.0.0.1:3000/").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

echo "flipping $NAME: $BEFORE -> $([ "$WANT" = 1 ] && echo enforce || echo report-only)"

# Rehearse first, on a throwaway port. The previous version of this script
# stopped the live container before proving the new config could even start, and
# a bad -p spec left the site at 502 for three minutes. A flip must not be able
# to take the site down by a typing mistake.
TMP="${NAME}-flip"
docker rm -f "$TMP" >/dev/null 2>&1 || true
run_container "$TMP" "$WANT" 0 || { echo "FATAL: rehearsal start failed — live untouched" >&2; exit 1; }
if ! wait_health "$TMP"; then
  echo "FATAL: rehearsed config is not healthy — live container untouched" >&2
  docker logs --tail 20 "$TMP" >&2 || true
  docker rm -f "$TMP" >/dev/null 2>&1 || true
  exit 1
fi
echo "rehearsal ok (same image, same env, no public port yet)"

docker rm -f "$TMP" >/dev/null 2>&1 || true
docker stop "$NAME" >/dev/null
docker rm -f "$NAME" >/dev/null
if ! run_container "$NAME" "$WANT" 1; then
  echo "FATAL: swap failed — restoring $BEFORE" >&2
  PREV_WANT=$([ "$BEFORE" = enforce ] && echo 1 || echo 0)
  run_container "$NAME" "$PREV_WANT" 1 || true
  exit 1
fi

if ! wait_health "$NAME"; then
  echo "FATAL: new container failed health after swap — restoring $BEFORE from saved config" >&2
  docker logs --tail 20 "$NAME" >&2 || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  PREV_WANT=$([ "$BEFORE" = enforce ] && echo 1 || echo 0)
  run_container "$NAME" "$PREV_WANT" 1 || true
  exit 1
fi

sleep 2
echo "mode now: $(cur_mode)"
curl -s -o /dev/null -w "local / -> %{http_code}\n" http://127.0.0.1:3000/
curl -s -D- -o /dev/null http://127.0.0.1:3000/ | grep -io '^content-security-policy[a-z-]*' | head -1
echo "previous config saved: /var/lib/skopein/csp-mode.previous"
