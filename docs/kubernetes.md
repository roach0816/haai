# Kubernetes Deployment

HAAI is distributed as a Helm chart and container image published to GHCR.

## Install

```bash
helm upgrade --install haai oci://ghcr.io/roach0816/charts/haai \
  --version <version> \
  --namespace haai \
  --create-namespace
```

Ingress is disabled by default. Test with:

```bash
kubectl -n haai port-forward svc/haai 8787:80
```

Then open:

```text
http://127.0.0.1:8787
```

## Ingress

Use your own Ingress controller, Gateway, certificate issuer, and DNS. A generic example is available in `deploy/examples/values.example.yaml` and uses `app.example.com`.

## Secrets

If you are using a private image or private fork, create an image-pull Secret and reference it with `image.pullSecrets`.

To provide a deterministic HAAI app secret, create a Kubernetes Secret with key `haai-secret` and set:

```yaml
existingSecret: haai-secrets
```

The chart mounts the Secret as a file and sets `HAAI_SECRET_FILE`.

If HAAI is exposed through a trusted Ingress or Gateway, set `config.HAAI_TRUST_PROXY` to `"true"` in your Helm values.

## Replica Safety

HAAI uses SQLite in `/data`. The chart supports one active replica and uses a `Recreate` strategy to avoid overlapping writers. Do not horizontally scale HAAI unless the storage/database design changes.

## Upgrade

```bash
helm upgrade haai oci://ghcr.io/roach0816/charts/haai \
  --version <version> \
  --namespace haai
```

The HAAI Settings > Updates card can check the configured release source and show the latest version, but Kubernetes deployments should apply updates by upgrading the Helm release in Rancher or Helm.

Rollback uses Helm release history, but database migrations may not be reversible. Restore a matching PVC backup if a rollback crosses an incompatible migration.
