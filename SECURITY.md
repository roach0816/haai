# Security Policy

## Supported Versions

HAAI is actively maintained on the latest published release. Security fixes are not backported to older releases unless a release note explicitly says otherwise.

| Version | Supported |
|---|---|
| Latest published release | Yes |
| Older releases | No |

Upgrade appliance, Docker, and Kubernetes deployments to the latest release before reporting a problem that may already be fixed.

## Reporting a Vulnerability

Report suspected vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/roach0816/haai/security/advisories/new). If that form is unavailable, contact the maintainer through the [GitHub profile](https://github.com/roach0816) to arrange a private reporting channel. Do not open a public issue or discussion for an unpatched vulnerability.

Include:

- affected HAAI version and deployment type,
- a concise reproduction path and expected impact,
- whether the issue requires authentication or network access,
- relevant logs with secrets and private identifiers removed,
- any known mitigation or workaround.

Do not include Home Assistant tokens, AI provider keys, Cloudflare tokens, GitHub tokens, kubeconfigs, SQLite databases, or private hostnames in public issues.

The maintainer will review reports as availability permits. Please allow time for investigation and coordinated remediation before public disclosure.

## Deployment Notes

HAAI stores local application state, encrypted secrets, analysis history, sessions, and certificates in its persistent data directory. Protect `/data` on containers and `/var/lib/haai` on appliance installs like application secret material. Back up the encryption secret together with the database.

HAAI is designed to call read-oriented Home Assistant APIs in v1, but Home Assistant Long-Lived Access Tokens can still carry broad account permissions. Treat Home Assistant tokens as sensitive credentials and use the least-privileged Home Assistant account available.

For internet-facing deployments, place HAAI behind trusted TLS termination such as a reverse proxy, Cloudflare Tunnel, Kubernetes Ingress, Gateway, or load balancer. Set `HAAI_TRUST_PROXY=true` only when direct client access is blocked and the trusted proxy replaces forwarded headers.

Keep the local admin password unique and strong. HAAI does not provide multi-factor authentication; use an identity-aware proxy or private network boundary when stronger access control is required.

OpenAI MCP server support is beta and requires a remotely reachable MCP endpoint. Require authentication, expose only the minimum read-only tools, and do not allow MCP tools that can change Home Assistant state.

Container deployments should use immutable image/chart versions and platform-managed upgrades. Keep `/data` persistent, run one active replica, and protect any Docker or Kubernetes Secret that supplies `HAAI_SECRET_FILE`.
