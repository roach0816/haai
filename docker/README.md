# HAAI Docker Deployment

Production Docker hosts should pull a published image from GHCR. They do not need this source repository and should not run `npm install`, `npm run build`, or `docker build`.

## Start

```bash
docker compose up -d
docker compose ps
docker compose logs -f
```

The default service is available at:

```text
http://localhost:8787
```

To expose a different host port without editing the file:

```bash
HAAI_HTTP_PORT=8080 docker compose up -d
```

## Update

```bash
docker compose pull
docker compose up -d --remove-orphans
```

## Reverse Proxy

HAAI serves HTTP on container port `8787`. You may put Nginx Proxy Manager, Caddy, Traefik, HAProxy, Apache, Cloudflare Tunnel, Tailscale Serve, or another HTTP proxy in front of it.

For proxy-only deployments, remove the `ports` mapping from `compose.yaml` and attach the service to your proxy network.

## Development Source Build

Local source builds are for development workstations and CI only:

```bash
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```
