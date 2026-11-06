#!/usr/bin/env bash
# tree-lock.sh — one writer per working tree, across every session on this host.
#
# Why: the deploy lock stopped two sessions from deploying at once, but both of
# mine were still editing the same checkout. That is how a commit of mine landed
# on top of a commit I had not seen, and how a build picked up half of somebody
# else's change. The deploy lock protects the port; this one protects the tree.
#
# Usage:
#   tree-lock.sh status
#   tree-lock.sh run -- <command...>     # hold the lock for the whole command
#   tree-lock.sh check                   # exit 0 if *this* process's session holds it
#   tree-lock.sh force                   # clear a stale lock (refuses if held)
#
# Exit codes: 0 ok · 4 busy/not held · 5 force refused
set -uo pipefail

LOCKFILE=/var/lock/skopein-tree.lock
OWNERFILE=/var/lock/skopein-tree.owner

session_id() {
  echo "${KIMI_SESSION:-${OPENCLAW_SESSION:-$(ps -o sid= -p $$ | tr -d ' ')}}"
}

usage() { sed -n '3,17p' "$0" | sed 's/^# \{0,1\}//'; }

write_owner() {
  {
    echo "session=$(session_id)"
    echo "pid=$$"
    echo "host=$(hostname)"
    echo "started=$(date -Is)"
    echo "cmd=$1"
    echo "tree=${TREE:-/tmp/SkopeinSignal-main}"
  } > "$OWNERFILE"
}

# Is the owner pid an ancestor of this process? That is what "my own lock" means:
# a shell that took the lock and then ran git inherits it by descent, not by name.
owner_is_ancestor() {
  local target pid
  target=$(sed -n 's/^pid=//p' "$OWNERFILE" 2>/dev/null | head -1)
  [ -n "${target:-}" ] || return 1
  pid=$$
  while [ -n "${pid:-}" ] && [ "$pid" != "0" ] && [ "$pid" != "1" ]; do
    [ "$pid" = "$target" ] && return 0
    pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
  done
  return 1
}

cmd_status() {
  exec 9>"$LOCKFILE" || exit 1
  if flock -n 9; then
    echo "tree lock: FREE"
    rm -f "$OWNERFILE"
    exit 0
  fi
  echo "tree lock: HELD"
  [ -f "$OWNERFILE" ] && sed 's/^/  /' "$OWNERFILE" || echo "  (no owner file)"
  exit 4
}

cmd_check() {
  exec 9>"$LOCKFILE" || exit 1
  if flock -n 9; then
    # Nobody holds it — including us.
    echo "tree-lock: this session does not hold the tree lock" >&2
    [ -f "$OWNERFILE" ] && sed 's/^/  held by: /' "$OWNERFILE" >&2
    exit 4
  fi
  if owner_is_ancestor; then
    exit 0
  fi
  echo "tree-lock: the lock is held by another session" >&2
  sed 's/^/  /' "$OWNERFILE" >&2 2>/dev/null || true
  exit 4
}

cmd_run() {
  [ "${1:-}" = "--" ] && shift
  [ $# -gt 0 ] || { echo "tree-lock: nothing to run" >&2; exit 2; }
  exec 9>"$LOCKFILE" || exit 1
  WAIT=${TREE_LOCK_WAIT:-0}
  if ! flock -w "$WAIT" 9; then
    echo "tree-lock: BUSY — another session is editing this tree" >&2
    [ -f "$OWNERFILE" ] && sed 's/^/  /' "$OWNERFILE" >&2
    exit 4
  fi
  write_owner "$*"
  trap 'rm -f "$OWNERFILE"' EXIT INT TERM
  # Board state on acquire, same spirit as the git banner below: the one thing
  # you cannot see from inside your own session is what the other one asked you.
  # Non-urgent gaps are a warning; urgent ones are printed loudly but do NOT
  # block editing — only deploying is blocked, in deploy-prod.sh step 0.6.
  if [ -f /var/lib/skopein/coord/CHECKLIST.md ]; then
    checklist=$(bash /opt/skopein-whisper/checklist-gate.sh lock 2>&1); checklist_rc=$?
    echo "$checklist" | sed 's/^/   /'
    [ "$checklist_rc" -eq 4 ] && echo "   ^^ urgent and unanswered — deploying is blocked until answered"
  fi
  # The rule that came with the lock: know what you are inheriting.
  if [ -d "${TREE:-/tmp/SkopeinSignal-main}/.git" ]; then
    echo "-- tree state on acquire --"
    git -C "${TREE:-/tmp/SkopeinSignal-main}" log --oneline -3 2>/dev/null | sed 's/^/   /'
    git -C "${TREE:-/tmp/SkopeinSignal-main}" status --porcelain 2>/dev/null | head -12 | sed 's/^/   /'
    echo "-- end tree state --"
  fi
  "$@"
}

cmd_force() {
  local holders
  holders=$(fuser "$LOCKFILE" 2>/dev/null | tr -s ' ')
  if [ -n "${holders// /}" ]; then
    echo "tree-lock: REFUSING to force — pids still hold the file:$holders" >&2
    ps -o pid,etime,cmd -p ${holders} 2>/dev/null | sed 's/^/  /' >&2
    exit 5
  fi
  rm -f "$LOCKFILE" "$OWNERFILE"
  echo "tree-lock: stale lock cleared (no holder found)"
}

case "${1:-}" in
  status) cmd_status ;;
  check)  cmd_check ;;
  run)    shift; cmd_run "$@" ;;
  force)  cmd_force ;;
  -h|--help|help) usage ;;
  *) usage; exit 2 ;;
esac
