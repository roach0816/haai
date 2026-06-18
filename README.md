# Home Assistant AI

Home Assistant AI, or HAAI, is a read-only advisor for Home Assistant. It collects Home Assistant metadata through official APIs and generates copy-paste suggestions for automations, reliability, energy, comfort, and maintenance.

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
- Raspberry Pi OS Lite systemd units, GHCR container images, Docker Compose, and Helm/Kubernetes deployment paths.

## Architecture

| Runtime | Value |
|---|---|
| Application | Node.js/Fastify API serving React/Vite UI |
| Internal port | `8787` |
| Health endpoint | `GET /api/system/health` |
| Persistent path | `/data` in containers, `/var/lib/haai` on Pi appliance |
| Database | SQLite |
| Replica safety | One active replica only |
| Architectures | `linux/amd64` and `linux/arm64` container images |

See `docs/images/architecture.mmd` for the deployment diagram.

## Deployment Options

- Raspberry Pi appliance: use `install.sh` for systemd services and the in-app appliance updater.
- Docker Compose: use the published GHCR image and persistent `/data` volume.
- Kubernetes/K3s: use the published Helm chart and GHCR image.

Detailed guides:

- [Docker Compose](docs/docker.md)
- [Kubernetes and Helm](docs/kubernetes.md)
- [Configuration](docs/configuration.md)
- [Persistence](docs/persistence.md)
- [Backup and restore](docs/backup-restore.md)

## Raspberry Pi Appliance Deployment

The appliance target is Raspberry Pi OS Lite 64-bit on a Pi 4 or Pi 5.

Prerequisites:

- Raspberry Pi OS Lite 64-bit.
- Git.
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

If you are installing from a private fork or private release source, use a GitHub token or deploy key provided by that repository owner.

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
  - Source: `GitHub release`.
  - GitHub owner: `roach0816`
  - GitHub repo: `haai`
  - GitHub token: only required when the release source is private.

## Docker Compose

```bash
docker compose up -d
```

Update with:

```bash
docker compose pull
docker compose up -d --remove-orphans
```

## Kubernetes

```bash
helm upgrade --install haai oci://ghcr.io/roach0816/charts/haai \
  --version <version> \
  --namespace haai \
  --create-namespace
```

Ingress is disabled by default. HAAI uses SQLite and should run as one active replica.

## Ports and TLS on Raspberry Pi

The app defaults to port `8787` because ports below `1024` usually require extra Linux privileges. The systemd service grants ambient `CAP_NET_BIND_SERVICE`, which allows the non-root `haai` user to bind ports such as `80` and `443` without running the app as root. The service intentionally does not narrow `CapabilityBoundingSet`, because the GUI updater and restart controls use a tightly scoped sudoers rule to start root-owned systemd units.

To use standard web ports on the Pi:

1. Go to Settings > Network & TLS.
2. Set HTTP port to `80` and HTTPS port to `443`.
3. Save settings.
4. Request a certificate if HTTPS will be enabled.
5. Click Restart service.

For containers and Kubernetes, keep the app on `8787` internally and terminate TLS at the reverse proxy, tunnel, Ingress, Gateway, or load balancer.

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

Home Assistant Long-Lived Access Tokens can still carry broad account permissions. Treat the token like a sensitive credential, use the least-privileged Home Assistant account available, and rotate the token if you suspect exposure.

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

- Automatic check: HAAI checks for new releases once an hour while the API service is running.
- Manual check: Settings > Updates > Check for updates.
- Manual apply: Settings > Updates > Apply update.
- Fallback check: `haai-updater.timer` runs daily and writes `/var/lib/haai/update-check.json`.

The GitHub owner, repo, and token are stored from the web UI. The token is encrypted in SQLite and materialized into `/var/lib/haai/updater-config.json` for the privileged updater service.

The appliance updater downloads the latest GitHub Release asset, verifies SHA-256, backs up `/opt/haai`, replaces the app files, installs production dependencies, reapplies service metadata, and restarts `haai-api.service`.

If an appliance update fails after the backup is created, the updater attempts to restore the previous app bundle. Manual rollback is also available:

```bash
sudo /opt/haai/appliance/scripts/haai-update rollback
```

For container deployments, use the Docker or Kubernetes image redeploy flow instead of the GUI Apply update button. The appliance updater is designed for the Raspberry Pi systemd install.

## Security

HAAI includes local username/password login, httpOnly SameSite cookies, rate limiting on sensitive auth routes, and standard HTTP security headers. For public or remote access, terminate TLS at a trusted reverse proxy, Cloudflare Tunnel, Kubernetes Ingress, Gateway, load balancer, or the Raspberry Pi appliance TLS listener.

When HAAI is behind a trusted reverse proxy, set `HAAI_TRUST_PROXY=true` so client IP and protocol handling use forwarded headers. Session cookies automatically use the `Secure` flag for HTTPS requests or requests with `X-Forwarded-Proto: https`. You can override this with `HAAI_COOKIE_SECURE=true` or `HAAI_COOKIE_SECURE=false`.

See [SECURITY.md](SECURITY.md) for vulnerability reporting and deployment notes.

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

## License

HAAI is released under the [MIT License](LICENSE).
