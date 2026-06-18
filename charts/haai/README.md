# HAAI Helm Chart

This chart installs Home Assistant AI as a single-replica Kubernetes workload.

HAAI uses SQLite in `/data`, so the chart defaults to one replica, a `Recreate` deployment strategy, and a PersistentVolumeClaim. Do not run multiple active replicas against the same data volume.

## Install

```bash
helm upgrade --install haai oci://ghcr.io/roach0816/charts/haai \
  --version <version> \
  --namespace haai \
  --create-namespace
```

Ingress is disabled by default. Use `kubectl port-forward` or enable Ingress with your own hostname and TLS configuration.

## Optional Secret

To provide a deterministic app encryption secret, create a Kubernetes Secret with key `haai-secret`, then set:

```yaml
existingSecret: haai-secrets
```

The chart mounts the Secret as a file and sets `HAAI_SECRET_FILE`.
