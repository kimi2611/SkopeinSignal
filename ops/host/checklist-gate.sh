#!/usr/bin/env bash
# Checklist gate — the cross-session board is only worth anything if a missed
# answer can stop a release.
#
# /var/lib/skopein/coord/CHECKLIST.md is the only back-channel between the two
# sessions (one of them sits in a DM and cannot receive group messages). It is
# read every 30 minutes by the other side, which means a question can sit
# unanswered for half an hour while work proceeds on the very code it asks
# about. That is how this morning's registration-order question nearly became
# rework.
#
# Contract:
#   * a row is URGENT when its cells contain "急" or "⚡";
#   * a row is ANSWERED when the cell after "答:" is non-empty;
#   * urgent + unanswered  -> exit 4 (the caller must refuse to proceed);
#   * anything else        -> exit 0, with a count on stdout so the gap stays
#                             visible instead of quietly accumulating.
#
# Read-only: this script never writes the board. Only the two sessions write it.
set -uo pipefail

BOARD=${CHECKLIST:-/var/lib/skopein/coord/CHECKLIST.md}
MODE=${1:-deploy} # deploy | lock

if [ ! -f "$BOARD" ]; then
  echo "checklist-gate: no board at $BOARD (nothing to enforce)"
  exit 0
fi

python3 - "$BOARD" "$MODE" <<'PY'
import re, sys

board, mode = sys.argv[1], sys.argv[2]
rows, urgent_open, open_count = [], [], 0

for raw in open(board, encoding="utf-8"):
    line = raw.rstrip("\n")
    if not line.startswith("|"):
        continue
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    if len(cells) < 4:
        continue
    if set("".join(cells)) <= set("-: "):  # separator row
        continue
    if cells[0].lower() in ("#", ""):  # header row
        continue
    number, item, asks, answer = cells[0], cells[1], cells[2], "|".join(cells[3:])
    answer = re.sub(r"^答[:：]\s*", "", answer).strip()
    answered = bool(answer)
    urgent = ("急" in item + asks) or ("⚡" in item + asks) or ("⚡" in number) or ("急" in number)
    rows.append((number, item, answered, urgent))
    if not answered:
        open_count += 1
        if urgent:
            urgent_open.append((number, item))

if urgent_open:
    print(f"checklist-gate: {len(urgent_open)} urgent item(s) still unanswered in {board}")
    for number, item in urgent_open:
        print(f"  #{number}  {item[:90]}")
    print("  answer them (认 / 不认 / 你改 / 没有) before proceeding")
    sys.exit(4)

if open_count:
    print(f"checklist-gate: clear — {open_count} non-urgent item(s) unanswered (fine to proceed)")
else:
    print("checklist-gate: clear — board fully answered")
sys.exit(0)
PY
