# Home Assistant AI Appliance

Home Assistant AI is a read-only advisor for a Home Assistant instance. It runs on a separate Raspberry Pi 4/5 64-bit node, collects Home Assistant metadata through official APIs, and generates copy-paste suggestions for automations, reliability, energy, and maintenance.

## Current Implementation

- React + Vite + TypeScript web UI.
- Fastify API with local username/password login.
- SQLite persistence with local history for snapshots, analysis runs, and suggestions.
- Encrypted storage for Home Assistant tokens and AI provider keys.
- Runtime port settings and Let's Encrypt DNS-01 certificate requests through Cloudflare.
- Home Assistant REST/WebSocket connection test and REST snapshot collection.
- AI provider adapters for OpenAI, Anthropic, and Gemini.
- Heuristic fallback suggestions when no AI key is configured or a provider call fails.
- Manual analysis runs and a simple daily cron scheduler.
- Raspberry Pi OS Lite systemd units and container image publishing for deployment.

## Deployment Options

- Raspberry Pi appliance: use the installer in this repo. This is the appliance-style path with systemd services and the in-app updater.
- Container: use the GitHub Container Registry image. This is the Docker/Kubernetes path with persistent `/data` storage and image-based updates.

## Raspberry Pi Appliance Deployment

The appliance target is Raspberry Pi OS Lite 64-bit on a Pi 4 or Pi 5.

Prerequisites:

- Raspberry Pi OS Lite 64-bit.
- Git access to the HAAI repository or release source.
- A GitHub token or deploy key if the repository is private.
- A Home Assistant Long-Lived Access Token for first-run setup.

### Clone and install

On the Pi:

```bash
sudo mkdir -p /opt/haai
sudo chown "$USER":"$USER" /opt/haai
git clone https://github.com/roach0816/haai.git /opt/haai
cd /opt/haai
sudo ./install.sh
```

If the repository is private and Git asks for credentials, use your GitHub username and paste a token with repository read access as the password. A deploy key also works for SSH-based clones.

The installer is intended to feel like a normal Linux application installer. It:

- installs required Debian/Raspberry Pi OS packages,
- installs Node.js 22 when the OS Node.js version is missing or too old,
- installs Node dependencies,
- builds the React and Fastify app,
- creates the `haai` system user,
- creates `/etc/haai/haai.env`, `/var/lib/haai`, and `/var/log/haai`,
- installs and verifies systemd services and sudoers permissions,
- starts the API service and updater timer,
- optionally installs `cloudflared` and registers a Cloudflare Tunnel service.

The installer creates `/etc/haai/haai.env` for bootstrap runtime basics such as host and data directory. Ports are controlled from the web UI unless `HAAI_PORT` is explicitly set in that file. It also installs and verifies:

- `haai-api.service`
- `haai-updater.service`
- `haai-updater.timer`
- `haai-apply-update.service`
- `/etc/sudoers.d/haai-updater`

Then open:

```text
http://<pi-ip>:8787
```

Advanced install overrides:

```bash
sudo HAAI_APP_DIR=/opt/haai HAAI_DATA_DIR=/var/lib/haai ./install.sh
```

If you install OS or Node dependencies yourself, skip that part:

```bash
sudo HAAI_INSTALL_OS_DEPS=0 ./install.sh
```

Optional Cloudflare Tunnel install for remote MCP access:

```bash
sudo HAAI_INSTALL_CLOUDFLARED=1 ./install.sh
```

To install `cloudflared` and register a tunnel service in one pass, create a remotely-managed Cloudflare Tunnel in the Cloudflare Zero Trust dashboard, copy the tunnel token, then run:

```bash
read -rsp "Cloudflare tunnel token: " HAAI_TUNNEL_TOKEN
echo
sudo HAAI_INSTALL_CLOUDFLARED=1 HAAI_CLOUDFLARED_TOKEN="${HAAI_TUNNEL_TOKEN}" ./install.sh
unset HAAI_TUNNEL_TOKEN
```

For a token file instead of an inline environment variable:

```bash
sudo HAAI_INSTALL_CLOUDFLARED=1 HAAI_CLOUDFLARED_TOKEN_FILE=/path/to/tunnel-token.txt ./install.sh
```

Create the local admin user, then go to Settings and configure:

- Home Assistant URL and Long-Lived Access Token.
- AI provider, model, and API key.
- Network & TLS:
  - HTTP port: default `8787`.
  - HTTPS port: default `443`.
  - SSL hostname.
  - DNS provider: `Cloudflare`.
  - Cloudflare token for Let's Encrypt DNS validation.
- Appliance update source:
  - Source: `Private GitHub release` if releases are private.
  - GitHub owner: `roach0816`
  - GitHub repo: `haai`
  - GitHub token: a token with release asset read access.

## Container Deployment

HAAI can run as a container. The container image is published to GitHub Container Registry when a `v*` release tag is pushed.

Container deployments should use persistent storage and image-based updates. Do not use the Raspberry Pi `install.sh` systemd installer inside a container.

### Login to GitHub Container Registry

The package is private while this project is private. Create a GitHub personal access token with `read:packages`, then log in:

```bash
docker login ghcr.io
```

Use your GitHub username and paste the token as the password. You can skip this step later if the image is public.

### Pull the Docker image

This command pulls the latest published image:

```bash
docker pull ghcr.io/roach0816/haai:latest
```

To run a specific version:

```bash
docker pull ghcr.io/roach0816/haai:<version>
```

### Create persistent data storage

The image stores SQLite data, encrypted secrets, runtime configuration, certificates, update metadata, logs, and local history in `/data`.

Using a named Docker volume is the easiest option:

```bash
docker volume create haai-data
```

If you prefer a bind mount, create a host directory and ensure the container can write to it:

```bash
mkdir -p /opt/haai-data
```

### Create and run the container

Use the following command to create and run HAAI:

```bash
docker run --name haai \
  --restart unless-stopped \
  -v haai-data:/data \
  -e HAAI_HOST=0.0.0.0 \
  -e HAAI_PORT=8787 \
  -e HAAI_DATA_DIR=/data \
  -e HAAI_RESTART_MODE=direct \
  -p 8787:8787/tcp \
  -d ghcr.io/roach0816/haai:latest
```

Then open:

```text
http://<docker-host>:8787
```

Do not forget to use persistent storage. If `/data` is not persisted, HAAI will lose setup state, encrypted keys, history, certificates, and settings when the container is removed.

### Port mappings you may need

- `-p 8787:8787/tcp`: default HAAI web UI and API.
- `-p 80:8787/tcp`: expose HAAI on standard HTTP while keeping the container on port `8787`.
- `-p 443:8787/tcp`: only use this behind a TLS-terminating proxy or if you explicitly configure HTTPS behavior for your environment.

For containers, it is usually cleaner to keep HAAI listening on `8787` internally and expose `80`/`443` through Docker port mapping, a reverse proxy, Cloudflare Tunnel, or Kubernetes Ingress.

### Control the container

```bash
docker start haai
docker stop haai
docker restart haai
docker logs -f haai
docker rm haai
```

### Update to a newer version

Container deployments should update by replacing the image, not by using the appliance/systemd updater.

```bash
docker pull ghcr.io/roach0816/haai:latest
docker stop haai
docker rm haai
docker run --name haai \
  --restart unless-stopped \
  -v haai-data:/data \
  -e HAAI_HOST=0.0.0.0 \
  -e HAAI_PORT=8787 \
  -e HAAI_DATA_DIR=/data \
  -e HAAI_RESTART_MODE=direct \
  -p 8787:8787/tcp \
  -d ghcr.io/roach0816/haai:latest
```

The named `haai-data` volume preserves your app state across container replacement.

### Running pre-release builds

Every GitHub release tag publishes a matching container tag. To run a specific pre-release build, replace `latest` with the version:

```bash
docker run --name haai \
  --restart unless-stopped \
  -v haai-data:/data \
  -e HAAI_HOST=0.0.0.0 \
  -e HAAI_PORT=8787 \
  -e HAAI_DATA_DIR=/data \
  -e HAAI_RESTART_MODE=direct \
  -p 8787:8787/tcp \
  -d ghcr.io/roach0816/haai:<version>
```

### Docker Compose

This repository includes `compose.yml`. Start it with:

```bash
docker compose up -d
```

The compose file uses:

```yaml
services:
  haai:
    image: ghcr.io/roach0816/haai:latest
    container_name: haai
    restart: unless-stopped
    ports:
      - "8787:8787"
    environment:
      HAAI_HOST: 0.0.0.0
      HAAI_PORT: "8787"
      HAAI_DATA_DIR: /data
      HAAI_RESTART_MODE: direct
    volumes:
      - haai-data:/data

volumes:
  haai-data:
```

Update with:

```bash
docker compose pull
docker compose up -d
```

### Kubernetes

Use a persistent volume claim for `/data`, run the app on container port `8787`, and expose it with a Service plus Ingress.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: haai-data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: haai
spec:
  replicas: 1
  selector:
    matchLabels:
      app: haai
  template:
    metadata:
      labels:
        app: haai
    spec:
      containers:
        - name: haai
          image: ghcr.io/roach0816/haai:latest
          imagePullPolicy: Always
          ports:
            - containerPort: 8787
          env:
            - name: HAAI_HOST
              value: "0.0.0.0"
            - name: HAAI_PORT
              value: "8787"
            - name: HAAI_DATA_DIR
              value: /data
            - name: HAAI_RESTART_MODE
              value: direct
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: haai-data
---
apiVersion: v1
kind: Service
metadata:
  name: haai
spec:
  selector:
    app: haai
  ports:
    - name: http
      port: 8787
      targetPort: 8787
```

Ingress should terminate TLS and route to the `haai` Service on port `8787`. If your GHCR image is private, configure an `imagePullSecret` for GitHub Container Registry.

### Additional container configuration

- `HAAI_DATA_DIR=/data` is required for persistent state.
- `HAAI_PORT=8787` pins the container listener to the documented internal port.
- `HAAI_RESTART_MODE=direct` makes the GUI restart button exit the Node process; Docker or Kubernetes restart policy starts it again.
- Leave the appliance update source unconfigured in container deployments unless you specifically want read-only update checks. Do not use the GUI Apply update button for containers.
- Let's Encrypt DNS-01 can work in a container if `/data` is persistent.
- Cloudflare Tunnel should run as a separate container or Kubernetes sidecar, not through the Raspberry Pi systemd installer.

## Ports and TLS

The app defaults to port `8787` because ports below `1024` usually require extra Linux privileges. The systemd service grants ambient `CAP_NET_BIND_SERVICE`, which allows the non-root `haai` user to bind ports such as `80` and `443` without running the app as root. The service intentionally does not narrow `CapabilityBoundingSet`, because the GUI updater and restart controls use a tightly scoped sudoers rule to start root-owned systemd units.

To use standard web ports on the Pi:

1. Go to Settings > Network & TLS.
2. Set HTTP port to `80` and HTTPS port to `443`.
3. Save settings.
4. Request a certificate if HTTPS will be enabled.
5. Click Restart service.

For containers, you can either leave the app on `8787` internally and map host ports externally, or set the internal ports in the UI. An explicit `HAAI_PORT` environment variable overrides the UI runtime config and is mainly intended for bootstrap or container deployments.

Let's Encrypt support uses DNS-01 validation with Cloudflare. Create a Cloudflare API token scoped as narrowly as possible:

- Permissions: `Zone:Read` and `DNS:Edit`.
- Zone resources: only the DNS zone for the hostname you will use.

The app creates a temporary TXT record at `_acme-challenge.<hostname>`, waits for DNS propagation, requests the certificate, and then removes the TXT record. The Cloudflare token is encrypted in SQLite and is not returned to the browser after saving.

## Cloudflare Tunnel for OpenAI MCP

OpenAI MCP tools must reach the MCP server over the internet. If your HAAI appliance and `ha-mcp` server are only available on your LAN, use Cloudflare Tunnel instead of opening router ports.

Recommended setup:

1. Run `ha-mcp` on the Pi or another local host.
2. In Cloudflare Zero Trust, create a Cloudflare Tunnel.
3. Add a public hostname, for example `ha-mcp.example.com`.
4. Point the tunnel service to the local MCP server, for example `http://127.0.0.1:8124`.
5. Install/register `cloudflared` with the optional installer flags above.
6. In HAAI, go to AI Configuration:
   - Provider: `OpenAI`.
   - Enable OpenAI MCP server.
   - Server label: `ha-mcp`.
   - Server URL: your public MCP endpoint, for example `https://ha-mcp.example.com/mcp`.
   - Authorization token: use one if your MCP server expects it.
   - Allowed tools: prefer a short allowlist of read-only tools.

This does not expose the HAAI web UI unless you explicitly create a tunnel route to HAAI. Keep the tunnel scoped to the MCP endpoint you need OpenAI to call.

## Home Assistant Access

Use a Long-Lived Access Token from the Home Assistant profile page. This app is designed for read-only use in v1 and does not call Home Assistant write endpoints.

Collected data is minimized before AI analysis:

- latitude, longitude, elevation, GPS accuracy, IP, and MAC-like fields are removed where they commonly appear.
- excluded domains and entities can be configured in Settings.

## Suggestion Categories

- Automation Opportunities
- Automation Improvements
- Reliability & Safety
- Energy & Comfort
- Organization & Maintenance

Every suggestion includes rationale, evidence, confidence, effort, risk, install steps, rollback steps, and YAML when appropriate.

## Appliance Updates

Raspberry Pi appliance deployments can check for and apply updates from the web UI.

- Manual check: Settings > Updates > Check for updates.
- Manual apply: Settings > Updates > Apply update.
- Automatic check: `haai-updater.timer` runs daily and writes `/var/lib/haai/update-check.json`.

The GitHub owner, repo, and token are stored from the web UI. The token is encrypted in SQLite and materialized into `/var/lib/haai/updater-config.json` for the privileged updater service.

The appliance updater downloads the latest GitHub Release asset, verifies SHA-256, backs up `/opt/haai`, replaces the app files, installs production dependencies, reapplies service metadata, and restarts `haai-api.service`.

If an appliance update fails after the backup is created, the updater attempts to restore the previous app bundle. Manual rollback is also available:

```bash
sudo /opt/haai/appliance/scripts/haai-update rollback
```

For container deployments, use the Docker or Kubernetes image redeploy flow instead of the GUI Apply update button. The appliance updater is designed for the Raspberry Pi systemd install.

If Network & TLS settings save but the active listener does not change, check for an old explicit port override:

```bash
sudo grep HAAI_PORT /etc/haai/haai.env
```

If needed, remove or comment `HAAI_PORT=8787`, then restart from the GUI or run:

```bash
sudo systemctl restart haai-api.service
```

## Local Development

For local development:

```bash
npm install
export HAAI_DATA_DIR="$PWD/.data"
npm run dev
```

Open the UI at `http://localhost:5173`. The API listens on `http://localhost:8787` by default.

For a production-style local run:

```bash
npm run build
npm start
```

Maintainer release and versioning workflow is documented in `AGENTS.md`.
