# Kubernetes Deployment

HAAI is distributed as a Helm chart and container image published to GHCR.

## Install

```bash
helm upgrade --install haai oci://ghcr.io/roach0816/charts/haai \
  --version <version> \
  --namespace haai \
  --create-namespace
```

Both the OCI chart package and `ghcr.io/roach0816/haai` image must be publicly visible for anonymous pulls. If an OCI pull returns `403` or `denied`, the chart package is still private; authenticate to GHCR or use the Rancher Git repository installation below.

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

TLS terminates at the Ingress, Gateway, or load balancer. Container deployments do not expose HAAI's appliance-only listener or certificate controls.

## Rancher GUI

1. In **Apps > Repositories**, add `https://github.com/roach0816/haai.git` with branch `main`. The public repository does not require authentication.
2. Refresh the repository and install the HAAI chart into a dedicated `haai` namespace.
3. Configure persistence, Ingress, resources, and any existing Secrets in the values editor.
4. To upgrade, refresh the repository, open HAAI under **Installed Apps**, choose **Upgrade**, select the target chart version, and retain the existing values/PVC.

Leave `image.tag` empty to use the chart's `appVersion`. Chart and image versions are published together, so chart `<version>` selects image `ghcr.io/roach0816/haai:<version>`.

## Secrets

If you are using a private image or private fork, create an image-pull Secret and reference it with `image.pullSecrets`.

To provide a deterministic HAAI app secret, create a Kubernetes Secret with key `haai-secret` and set:

```yaml
existingSecret: haai-secrets
```

The chart mounts the Secret as a file and sets `HAAI_SECRET_FILE`.

If HAAI is exposed through a trusted Ingress or Gateway, set `config.HAAI_TRUST_PROXY` to `"true"` in your Helm values.

Protect the app encryption key. If `existingSecret` is changed or lost, HAAI may be unable to decrypt credentials already stored in SQLite.

## Replica Safety

HAAI uses SQLite in `/data`. The chart supports one active replica and uses a `Recreate` strategy to avoid overlapping writers. Do not horizontally scale HAAI unless the storage/database design changes. The StorageClass must provide reliable POSIX locking; block-backed CSI storage is preferred, and NFS behavior should be validated before production use.

## Upgrade

```bash
helm upgrade haai oci://ghcr.io/roach0816/charts/haai \
  --version <version> \
  --namespace haai
```

The HAAI Updates card can check the public GitHub release source and show the latest version, but Kubernetes deployments can only apply updates by upgrading the Helm release in Rancher or Helm.

Rollback uses Helm release history, but database migrations may not be reversible. Restore a matching PVC backup if a rollback crosses an incompatible migration.

Verify an upgrade with:

```bash
kubectl -n haai rollout status deployment/haai
kubectl -n haai get pods
kubectl -n haai get deployment haai -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```
