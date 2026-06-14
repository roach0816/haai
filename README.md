# Home Assistant AI Appliance

Home Assistant AI is a read-only advisor for a Home Assistant instance. It runs on a separate Raspberry Pi 4/5 64-bit node, collects Home Assistant metadata through official APIs, and generates copy-paste suggestions for automations, reliability, energy, and maintenance.

## Current Implementation

- React + Vite + TypeScript web UI.
- Fastify API with local username/password login.
- SQLite persistence with local history for snapshots, analysis runs, and suggestions.
- Encrypted storage for Home Assistant tokens and AI provider keys.
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

Open the UI at `http://localhost:5173`. The API listens on `http://localhost:8787`.

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

The installer creates `/etc/haai/haai.env` for runtime basics such as host, port, and data directory. GitHub update settings are configured in the web UI after first login, not in this file.

Restart after installation:

```bash
sudo systemctl restart haai-api.service
```

Then open:

```text
http://<pi-ip>:8787
```

Create the local admin user, then go to Settings and configure:

- Home Assistant URL and Long-Lived Access Token.
- AI provider, model, and API key.
- Appliance update source:
  - Source: `Private GitHub release`
  - GitHub owner: `roach0816`
  - GitHub repo: `haai`
  - GitHub token: the fine-grained token with `Contents: Read-only`

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

- Manual: Settings > Appliance > Check for updates.
- Periodic: `haai-updater.timer` runs daily and writes `/var/lib/haai/update-check.json`.

The GitHub owner, repo, and token are stored from the web UI. The token is encrypted in SQLite and materialized into `/var/lib/haai/updater-config.json` for the privileged updater service.

The GUI Apply update button starts `haai-apply-update.service`, which runs as root. The updater reads the latest GitHub Release, downloads the `haai-<version>.tgz` asset, verifies SHA-256 using GitHub's asset digest or the uploaded `.sha256` file, backs up `/opt/haai`, replaces the app files, installs production dependencies, and restarts `haai-api.service`.

If an update fails after the backup is created, the updater attempts to restore the previous app bundle. Manual rollback is also available:

```bash
sudo /opt/haai/appliance/scripts/haai-update rollback
```
