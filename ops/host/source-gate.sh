#!/usr/bin/env bash
# source-gate.sh — a deploy must correspond to a commit that exists off this box.
#
# Why this exists: v74 was built from a tree with uncommitted changes, and the
# commit only happened *after* the container was already serving. Nothing broke,
# but "v74 corresponds to which commit?" had no answer, and rollback could only
# be done by image tag. The image tag is a real safety net; it is not the same
# thing as readable source. The other session asked the question and was right.
#
# Rules, in order:
#   1. the tree must be a git checkout      (else: what are we even shipping?)
#   2. it must be clean                      (uncommitted work is not reviewable)
#   3. HEAD must equal origin/<branch>       (a commit only on this box is not a
#                                             commit anybody else can check out)
#
# Exit codes: 0 ok · 6 violates a rule
set -uo pipefail

SRC=${1:-/tmp/skopein-repo}
cd "$SRC" 2>/dev/null || { echo "source-gate: no directory $SRC" >&2; exit 6; }

git rev-parse --git-dir >/dev/null 2>&1 || {
  echo "source-gate: $SRC is not a git checkout — nothing to point at after a rollback" >&2
  exit 6
}

dirty=$(git status --porcelain)
if [ -n "$dirty" ]; then
  echo "source-gate: working tree is dirty; commit or stash first" >&2
  echo "$dirty" | head -12 | sed 's/^/  /' >&2
  exit 6
fi

branch=$(git rev-parse --abbrev-ref HEAD)
sha=$(git rev-parse HEAD)

remote_sha=$(git ls-remote origin "refs/heads/$branch" 2>/dev/null | cut -f1)
if [ -z "$remote_sha" ]; then
  echo "source-gate: could not read origin/$branch — refusing to guess" >&2
  exit 6
fi
if [ "$remote_sha" != "$sha" ]; then
  echo "source-gate: HEAD ($sha) differs from origin/$branch ($remote_sha)" >&2
  echo "  push it first: git push origin $branch" >&2
  exit 6
fi

mkdir -p /var/lib/skopein
echo "$(date -Is) $sha $branch" >> /var/lib/skopein/deploys.log
echo "source-gate: $branch @ $sha (in sync with origin)"
# Caller reads this to label the image and to write into the release record.
echo "$sha" > /var/lib/skopein/.last-deploy-sha
