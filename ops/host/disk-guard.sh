#!/usr/bin/env bash
# Disk guard: keep the 40G root from filling up on a box that builds images.
# Runs from cron. Safe by design: only removes things that are already garbage
# (dangling images, stale build cache, logs past retention). Never touches an
# image a container references, so the v39 rollback image keeps its seat.
set -uo pipefail

LOG=/var/log/skopein/disk-guard.log
mkdir -p /var/log/skopein
TS=$(date -Is)

usage() { df --output=pcent / | tail -1 | tr -dc '0-9'; }
BEFORE=$(usage)
ACTED=""

# Never prune while an image is being built or a release is in flight. A
# multi-stage build keeps its intermediate "build" stage as an untagged image,
# and `docker image prune -f` happily deletes it — the build then dies with
# "invalid from flag value build: No such image". Learned the hard way twice
# (once blamed on a flaky overlay, it was this cron all along).
# Anchored patterns on purpose: an unanchored pgrep matches the caller's own
# command line whenever the words appear in it (a heredoc, an editor buffer),
# which made this guard skip itself.
if pgrep -f '^docker build' >/dev/null 2>&1 || ! flock -n /var/lock/skopein-deploy.lock true 2>/dev/null; then
  echo "$TS before=${BEFORE}% after=${BEFORE}% skip:build-or-deploy-in-progress" >> "$LOG"
  exit 0
fi

if [ "$BEFORE" -ge 80 ]; then
  RECLAIM=$(docker image prune -f 2>&1 | sed -n 's/^Total reclaimed space: //p')
  ACTED="prune:${RECLAIM:-0}"
  AFTER=$(usage)
  # Still tight after dangling images are gone: old build cache is the next
  # biggest pile, and anything older than 24h is by definition not in use.
  if [ "$AFTER" -ge 85 ]; then
    BC=$(docker builder prune -f --filter until=24h 2>&1 | sed -n 's/^Total reclaimed space: //p')
    ACTED="$ACTED buildcache:${BC:-0}"
    AFTER=$(usage)
  fi
else
  AFTER=$BEFORE
fi

# Logs have their own retention; the guard just enforces it.
find /var/log/skopein -type f -name '*.log' -mtime +14 -delete 2>/dev/null || true

echo "$TS before=${BEFORE}% after=${AFTER}% ${ACTED:-idle}" >> "$LOG"
tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"

# Only speak up when the situation is actually bad, so cron mail stays quiet.
if [ "$AFTER" -ge 90 ]; then
  echo "DISK CRITICAL: ${AFTER}% used on / (was ${BEFORE}%)" >&2
  exit 1
fi
exit 0
