# Configuration

HAAI uses the same container contract under Docker Compose and Kubernetes.

| Setting | Default | Purpose |
|---|---:|---|
| `HAAI_HOST` | `0.0.0.0` | Bind address inside the container. |
| `HAAI_PORT` | `8787` | Internal HTTP port. |
| `HAAI_DATA_DIR` | `/data` | Persistent application data directory. |
| `HAAI_DEPLOYMENT_MODE` | `container` | Selects container-aware UI and update behavior. |
| `HAAI_TRUST_PROXY` | `false` | Trust forwarded proxy headers when HAAI is behind a trusted reverse proxy, Ingress, or load balancer. |
| `HAAI_COOKIE_SECURE` | auto | Force session cookies to include or omit the `Secure` flag. Auto enables secure cookies for HTTPS or `X-Forwarded-Proto: https`. |
| `HAAI_SECRET` | unset | Optional app encryption bootstrap secret. |
| `HAAI_SECRET_FILE` | unset | Optional file containing the app encryption bootstrap secret. |

Basic installs require no exported shell variables and no `.env` file. Docker Compose and Helm pass safe internal defaults.

## Container Behavior

Container deployments expose application settings but do not expose in-app listener, certificate, restart, or update-apply controls. Manage external ports, TLS, restarts, and upgrades with Docker, Rancher/Kubernetes, an Ingress, Gateway, reverse proxy, load balancer, or Cloudflare Tunnel. The Updates card can check the public GitHub release source and provide deployment-specific instructions.

`HAAI_RESTART_MODE` and `HAAI_UPDATE_APPLY_MODE` remain internal compatibility settings in existing deployment files. They do not enable appliance-style controls in container mode and should not be used as a container update mechanism.

Set `HAAI_TRUST_PROXY=true` only when requests reach HAAI through a trusted proxy that replaces forwarded headers. Do not enable it when clients can connect directly and supply their own forwarded headers.

## Update Source

The default update source is the public `roach0816/haai` GitHub repository. Public release checks do not require a GitHub token. A token is only needed for a private fork or private release source.

## Secrets

Secrets entered through the web UI, such as Home Assistant tokens, AI provider keys, GitHub tokens, and Cloudflare tokens, are encrypted in SQLite. Persist `/data` so the encryption key file and encrypted values remain together unless you intentionally use `HAAI_SECRET` or `HAAI_SECRET_FILE`.

Home Assistant Long-Lived Access Tokens can carry broad account permissions even though HAAI is designed to call read-oriented APIs in v1. Use the least-privileged Home Assistant account available and protect the token like an admin credential unless your Home Assistant permissions prove otherwise.

Do not log or commit secret values. Prefer file-backed secrets for automated deployments.

## Beta Features

OpenAI MCP server support is currently beta. It may not work in every environment and is expected to become fully functional in a later release. Restrict MCP access to read-only tools and expose the MCP endpoint only through an authenticated, trusted connection.
