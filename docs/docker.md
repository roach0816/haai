# Docker Compose Deployment

HAAI can be deployed with Docker Compose using the published GHCR image.

## Install

Download the versioned `compose.yaml` artifact from the GitHub Release or use the file from this repository.

```bash
docker compose up -d
```

Open:

```text
http://localhost:8787
```

The Compose file uses a named volume mounted at `/data`. Do not remove that volume unless you intend to delete HAAI setup state, SQLite data, encrypted secrets, certificates, logs, and history.

## Private GHCR Images

If the package is private, log in with a GitHub token that has `read:packages`:

```bash
docker login ghcr.io
```

Do not put the token in `compose.yaml`.

## Ports

The container listens on `8787`. The host port is configurable:

```bash
HAAI_HTTP_PORT=8080 docker compose up -d
```

You can place any HTTP reverse proxy in front of HAAI. TLS normally terminates at the proxy, tunnel, load balancer, or gateway.

## Update

```bash
docker compose pull
docker compose up -d --remove-orphans
```

Use immutable version tags for stable deployments. `latest` is convenient for testing but should not be the only production pin.

## Development Build

Production hosts should not build source code. For local development only:

```bash
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```
