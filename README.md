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
- systemd unit files and updater scaffolding for Raspberry Pi OS Lite.

## Development

```bash
npm install
npm run dev
```

Open the UI at `http://localhost:5173`. The API listens on `http://localhost:8787` by default.

For local data:

```bash
export HAAI_DATA_DIR="$PWD/.data"
```

## Production Build

```bash
npm run build
npm start
```

The production server serves the built React app and API from the same port.

## Initial Raspberry Pi Deployment

The appliance target is Raspberry Pi OS Lite 64-bit on a Pi 4 or Pi 5.

### 1. Create the private GitHub repo

Create a private GitHub repository and push this code to it.

For the initial pre-release, use release tag `v0.0.1`. Versioning follows standard semantic version positions: major releases use the first digit (`1.x.x`), minor releases use the second digit (`x.1.x`), and pre-release/early iteration builds use patch versions such as `0.0.1` and `0.0.2`.

### 2. Create a read-only GitHub token

Create a fine-grained personal access token for the Pi:

- Repository access: only this private repository.
- Repository permissions: `Contents: Read-only`.
- Expiration: your choice; for a home appliance, a long expiration is simpler, but a shorter one is safer.

The Pi uses this token to read the private repository and download private GitHub Release assets.

### 3. Clone and install on the Pi

On the Pi:

```bash
sudo apt update
sudo apt install -y git curl nodejs npm
sudo mkdir -p /opt/haai
sudo chown "$USER":"$USER" /opt/haai
git clone https://github.com/roach0816/haai.git /opt/haai
cd /opt/haai
npm install
npm run build
sudo ./appliance/scripts/install-systemd.sh
```

When Git asks for credentials, use your GitHub username and paste the fine-grained token as the password.

The installer creates `/etc/haai/haai.env` for bootstrap runtime basics such as host and data directory. Ports are controlled from the web UI unless `HAAI_PORT` is explicitly set in that file. It also installs and verifies:

- `haai-api.service`
- `haai-updater.service`
- `haai-updater.timer`
- `haai-apply-update.service`
- `/etc/sudoers.d/haai-updater`

GitHub update settings are configured in the web UI after first login, not in the env file.

Then open:

```text
http://<pi-ip>:8787
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
  - Source: `Private GitHub release`
  - GitHub owner: `roach0816`
  - GitHub repo: `haai`
  - GitHub token: the fine-grained token with `Contents: Read-only`

## Ports and TLS

The app defaults to port `8787` because ports below `1024` usually require extra Linux privileges. The systemd service grants only `CAP_NET_BIND_SERVICE`, which allows the non-root `haai` user to bind ports such as `80` and `443` without running the app as root.

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

## GitHub Release Updates

All deployment and updates should roll through the private GitHub repository.

For manual local packaging:

```bash
npm run release:package -- --version-label=0.0.1
```

This creates:

```text
release/haai-0.0.1.tgz
release/haai-0.0.1.tgz.sha256
```

For normal releases, use the GitHub Actions workflow:

```bash
git tag v0.0.1
git push origin v0.0.1
```

The workflow will:

- install dependencies,
- typecheck,
- run tests,
- build the app,
- package `release/haai-0.0.1.tgz`,
- upload the tarball and `.sha256` checksum to the GitHub Release.

The app checks GitHub in two ways:

- Manual: Settings > Updates > Check for updates.
- Periodic: `haai-updater.timer` runs daily and writes `/var/lib/haai/update-check.json`.

The GitHub owner, repo, and token are stored from the web UI. The token is encrypted in SQLite and materialized into `/var/lib/haai/updater-config.json` for the privileged updater service.

The GUI Apply update button starts `haai-apply-update.service`, which runs as root through a narrow sudoers rule for the `haai` service user. The updater reads the latest GitHub Release, downloads the `haai-<version>.tgz` asset, verifies SHA-256 using GitHub's asset digest or the uploaded `.sha256` file, backs up `/opt/haai`, replaces the app files, installs production dependencies, and restarts `haai-api.service`.

The updater also reapplies the appliance service metadata from the release, including systemd units, sudoers rules, and the default env-file migration. This is required for settings such as port changes, TLS on `443`, and GUI-triggered service restarts to work after an app update.

If an update fails after the backup is created, the updater attempts to restore the previous app bundle. Manual rollback is also available:

```bash
sudo /opt/haai/appliance/scripts/haai-update rollback
```

If Network & TLS settings save but the active listener does not change, check for an old explicit port override:

```bash
sudo grep HAAI_PORT /etc/haai/haai.env
```

If needed, remove or comment `HAAI_PORT=8787`, then restart from the GUI or run:

```bash
sudo systemctl restart haai-api.service
```
