# Release gates

Run by `/opt/skopein-whisper/deploy-prod.sh` after a container is started and before
the funnel is considered done. Any failure rolls back to the previous image.

- `browser-gate.mjs <url>` — real Chromium: shell mounts, title, text, no MIME/module
  errors, deep route (`#/settings`) has its own heading. Opens a fresh page per route.
- `copy-gate.mjs <url>` — two layers: regex blacklist + required copy against the
  **served JS** (catches copy behind login that the DOM pass cannot reach), and a
  three-locale DOM pass (en / zh-CN / de) that catches untranslated keys rendering as
  English. Rules live in `copy-rules.json`; `forbidden` entries are regular expressions.
- `verify_v67_i18n.mjs` / `verify_v67_quotes.mjs` — one-off audits kept for reuse; they
  expect a running instance on :3000.

`deploy-prod.sh` itself is not in this repo: it embeds deployment secrets. Keep it on
the host at `/opt/skopein-whisper/deploy-prod.sh` and rotate secrets through it.
