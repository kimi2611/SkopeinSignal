# Host-level scripts

These do not run inside the container; they run from cron on the host and are
kept in the repo so a rebuilt box can be restored exactly.

## disk-guard.sh

`*/20 * * * * /opt/skopein-whisper/disk-guard.sh`

Prunes dangling images above 80% and build cache above 85%. Two rules matter
and both were learned by breaking something:

- **It must not prune during a build or deploy.** A multi-stage build keeps its
  intermediate `build` stage as an untagged image; `docker image prune -f`
  deletes it and the build dies with `invalid from flag value build: No such
  image`. Two failed v73 builds, both during a prune, before this was fixed.
- **The in-progress check must be anchored.** `pgrep -f "docker build"` matches
  the caller's own command line whenever those words appear in a heredoc or an
  editor buffer, so the guard skipped itself. The deploy check uses `flock -n`
  against the real deploy lock instead of matching a script name.

## csp-report.sh

`37 9 * * * /opt/skopein-whisper/csp-report.sh >/dev/null 2>&1`

Digests `/var/lib/skopein/csp/csp-*.jsonl` into one page at
`/var/log/skopein/csp-summary-YYYYMMDD.txt`. Report-Only blocks nothing, so the
data only matters if someone reads it; a JSONL dump does not get read.

Two rules learned while building the sink:

- **`report-to` silently swallowed every report.** With both `report-uri` and
  `report-to` present, Chrome switched to the Reporting API and delivered
  nothing; a bare `report-uri` test page reported within the same second. The
  policy now carries `report-uri` only.
- **The spool must not live under `/data/whisper-uploads`.** That tree is the
  chunk spool, and its sweeper deletes any entry older than 24h by mtime — the
  log would vanish exactly when it becomes interesting. It gets its own mount
  (`/var/lib/skopein/csp` → `/data/csp`).

## source-gate.sh

Called from `deploy-prod.sh` step 0.7. Refuses to deploy unless the tree is a git
checkout, is clean, and HEAD equals `origin/<branch>`. The image gets
`--label git.sha=<sha>`, so `docker inspect` answers "which commit is this?" —
which is exactly the question nobody could answer about v74, built from an
uncommitted tree and committed only after it was already serving.

Rule that came out of that: **commit → push → build → deploy**, in that order.
The gate exists so the order cannot be forgotten; `SKIP_SHA_GATE=1` is available
and prints a warning that production will carry no SHA.
