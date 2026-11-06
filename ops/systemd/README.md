# skopein-sidecar.service

The host-side faster-whisper service behind the "Server" transcription channel
(`WHISPER_SIDECAR_URL=http://host.docker.internal:9000` inside the container).
Install:

    cp ops/systemd/skopein-sidecar.service /etc/systemd/system/
    systemctl daemon-reload && systemctl enable --now skopein-sidecar

`Restart=always` is the point: the service used to be started by hand with
`setsid`, so it disappeared on reboot and nobody noticed until transcription
failed. Health: `curl -s localhost:9000/health` → `model`, `loaded`, `rssMb`.

`deploy-prod.sh` prints a non-blocking WARN when `/health` is unreachable.

## Restart bounds (synced 2026-11-06)

`StartLimitIntervalSec=600` / `StartLimitBurst=6` / `StartLimitAction=none` are in
the unit now, and the repo copy matches `/etc` byte for byte. Why: `RestartSec=5`
means the systemd default of five restarts per ten seconds is unreachable — five
restarts take 25 s — so a genuine crash loop restarts forever, never reaches
`failed`, and leaves nothing to alert on. Six in ten minutes is a loop, not a
blip; only restarts count, so a 140 s cold model load cannot trip it.

The trade-off is deliberate: once tripped the unit **stays** failed and needs
`systemctl reset-failed skopein-sidecar && systemctl start skopein-sidecar`.
That is exactly the moment the host-side `sidecar-watch.sh` cron should be
shouting at a human, which is why the two shipped together.
