# Docker Compose Deployment

HAAI can be deployed on `linux/amd64` and `linux/arm64` with Docker Compose using the public GHCR image.

## Install

Download `compose.yaml` from the desired GitHub Release into an empty directory, then start HAAI:

```bash
docker compose pull
docker compose up -d
```

Open:

```text
http://localhost:8787
```

The Compose file uses a named volume mounted at `/data`. Do not remove that volume unless you intend to delete HAAI setup state, SQLite data, encrypted secrets, certificates, logs, and history.

Verify the deployment with:

```bash
docker compose ps
curl http://127.0.0.1:8787/api/system/health
```

## Registry Access

The official `ghcr.io/roach0816/haai` image is public and does not require `docker login`.

If you are using a private image or private fork, log in with a GitHub token that has `read:packages`:

```bash
docker login ghcr.io
```

Do not put the token in `compose.yaml`.

## Ports

The container listens on `8787`. The host port is configurable:

```bash
HAAI_HTTP_PORT=8080 docker compose up -d
```

You can place any HTTP reverse proxy in front of HAAI. TLS normally terminates at the proxy, tunnel, load balancer, or gateway. Container deployments intentionally hide HAAI's appliance-only port, certificate, and restart controls.

When HAAI is behind a trusted reverse proxy, set:

```bash
HAAI_TRUST_PROXY=true docker compose up -d
```

## Update

The provided Compose file uses an immutable image tag. To update, download the `compose.yaml` artifact from the target release or change the image tag to the target version, then run:

```bash
docker compose pull
docker compose up -d --remove-orphans
```

The HAAI Updates card checks the public GitHub release source and shows release notes and Docker instructions. Container updates cannot be applied from inside HAAI.

Use immutable version tags for stable deployments. `latest` is convenient for testing but should not be the only production pin.

Keep the named volume during every update. See [Backup and Restore](backup-restore.md) before upgrades that may include migrations.

## Development Build

Production hosts should not build source code. For local development only:

```bash
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```
