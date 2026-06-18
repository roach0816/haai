# Configuration

HAAI uses the same container contract under Docker Compose and Kubernetes.

| Setting | Default | Purpose |
|---|---:|---|
| `HAAI_HOST` | `0.0.0.0` | Bind address inside the container. |
| `HAAI_PORT` | `8787` | Internal HTTP port. |
| `HAAI_DATA_DIR` | `/data` | Persistent application data directory. |
| `HAAI_RESTART_MODE` | `direct` | Allows the GUI restart action to exit the Node process so the runtime restarts it. |
| `HAAI_UPDATE_APPLY_MODE` | `direct` | Compatibility mode for container update actions; image redeploys remain recommended. |
| `HAAI_SECRET` | unset | Optional app encryption bootstrap secret. |
| `HAAI_SECRET_FILE` | unset | Optional file containing the app encryption bootstrap secret. |

Basic installs require no exported shell variables and no `.env` file. Docker Compose and Helm pass safe internal defaults.

Secrets entered through the web UI, such as Home Assistant tokens, AI provider keys, GitHub tokens, and Cloudflare tokens, are encrypted in SQLite. Persist `/data` so the encryption key file and encrypted values remain together unless you intentionally use `HAAI_SECRET` or `HAAI_SECRET_FILE`.

Do not log or commit secret values. Prefer file-backed secrets for automated deployments.
