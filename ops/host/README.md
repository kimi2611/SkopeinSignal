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
