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
