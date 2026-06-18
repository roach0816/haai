# Backup and Restore

Back up HAAI data before upgrades that may include migrations.

## Docker Named Volume Backup

```bash
docker run --rm \
  -v haai-data:/data:ro \
  -v "$PWD":/backup \
  alpine tar -czf /backup/haai-data-backup.tgz -C /data .
```

## Docker Named Volume Restore

Stop HAAI, restore into the named volume, then start HAAI:

```bash
docker compose stop
docker run --rm \
  -v haai-data:/data \
  -v "$PWD":/backup \
  alpine sh -c "rm -rf /data/* && tar -xzf /backup/haai-data-backup.tgz -C /data"
docker compose up -d
```

## Kubernetes PVC Backup

Use your storage platform's snapshot or backup tooling. A generic file copy backup can be made by running a temporary pod that mounts the PVC and archives `/data`.

## Kubernetes PVC Restore

Restore the PVC data before starting the HAAI pod. Recreate any Kubernetes Secrets separately because PVC backups do not include Secret objects.

## SQLite

The SQLite database lives inside `/data`. For consistent backups, stop HAAI or use a storage-level snapshot. Restoring an older image without restoring a matching database backup may fail if migrations changed the schema.
