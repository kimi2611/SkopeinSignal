#!/usr/bin/env bash
# Summarise collected CSP violations. Report-Only means nothing is blocked, so
# the only way this data is worth anything is if someone actually reads it —
# hence a one-page digest instead of a raw JSONL dump.
set -uo pipefail
SPOOL=${CSP_SPOOL:-/var/lib/skopein/csp}
OUTDIR=/var/log/skopein
mkdir -p "$OUTDIR"
STAMP=$(date +%Y%m%d)
OUT="$OUTDIR/csp-summary-$STAMP.txt"
{
  echo "CSP Report-Only digest — $(date -Is)"
  echo
  if ! ls "$SPOOL"/csp-*.jsonl >/dev/null 2>&1; then
    echo "No reports on disk at all."
    echo
    echo "Read that as: either nobody visited, or the policy matches the app."
    echo "Check the second one against traffic before believing it."
    exit 0
  fi
  echo "Files:"
  ls -l "$SPOOL"/csp-*.jsonl | awk '{print "  "$9"  "$5" bytes"}'
  echo
  echo "Per directive (count | blocked-uri | which document):"
  cat "$SPOOL"/csp-*.jsonl | python3 -c '
import sys, json, collections
agg = collections.Counter()
docs = collections.defaultdict(set)
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        d = json.loads(line)
    except Exception:
        continue
    key = (d.get("directive") or "?", (d.get("blocked") or "")[:70])
    agg[key] += 1
    docs[key].add((d.get("document") or "")[:60])
for (directive, blocked), n in agg.most_common(40):
    where = ", ".join(sorted(docs[(directive, blocked)])[:2])
    print(f"  {n:5d}  {directive:<22} {blocked or chr(45)}   <- {where}")
print()
print(f"  total reports: {sum(agg.values())}, distinct: {len(agg)}")
'
  echo
  echo "What to do with this: every line is either (a) something the enforcing"
  echo "policy must allow — add it to the allowlist with a reason — or (b) a real"
  echo "inline/foreign resource worth fixing. Anything in the top three lines is"
  echo "the decision that matters."
} > "$OUT" 2>&1
cat "$OUT"
