# Security Policy

## Supported Versions

HAAI is pre-1.0 software. Security fixes are expected to ship in the latest released version.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately through GitHub security advisories when available. If advisories are not enabled for this repository, contact the maintainer directly before publishing details.

Include:

- the HAAI version,
- deployment type, such as Raspberry Pi, Docker Compose, or Kubernetes,
- a concise reproduction path,
- relevant logs with secrets removed.

Do not include Home Assistant tokens, AI provider keys, Cloudflare tokens, GitHub tokens, kubeconfigs, SQLite databases, or private hostnames in public issues.

## Deployment Notes

HAAI stores local application state, encrypted secrets, analysis history, and certificates in its persistent data directory. Protect that directory like application secret material.

HAAI is designed to call read-oriented Home Assistant APIs in v1, but Home Assistant Long-Lived Access Tokens can still carry broad account permissions. Treat Home Assistant tokens as sensitive credentials and use the least-privileged Home Assistant account available.

For internet-facing deployments, place HAAI behind trusted TLS termination such as a reverse proxy, Cloudflare Tunnel, Kubernetes Ingress, Gateway, or load balancer. Enable proxy-aware settings such as `HAAI_TRUST_PROXY=true` when HAAI is behind a trusted reverse proxy.
