# Backup and Restore

Back up HAAI data before upgrades that may include database migrations. Keep the application encryption secret and SQLite data together; restoring only one can make encrypted settings unreadable.

## Docker Named Volume Backup

```bash
docker compose stop
docker run --rm \
  -v haai_haai-data:/data:ro \
  -v "$PWD":/backup \
  alpine tar -czf /backup/haai-data-backup.tgz -C /data .
docker compose start
```

The provided Compose project is named `haai`, so its named volume is normally `haai_haai-data`. Confirm the actual name with `docker volume ls` before backing up a customized deployment.

## Docker Named Volume Restore

Stop HAAI, restore into the named volume, then start HAAI:

```bash
docker compose down
docker run --rm \
  -v haai_haai-data:/data \
  -v "$PWD":/backup \
  alpine sh -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -xzf /backup/haai-data-backup.tgz -C /data'
docker compose up -d
```

Do not use `docker compose down -v`; `-v` deletes the named data volume.

## Kubernetes PVC Backup

Use your storage platform's CSI snapshot or backup tooling where possible. For a consistent file-level backup, scale the HAAI Deployment to zero before mounting the PVC in a temporary backup pod, then restore the Deployment to one replica afterward.

## Kubernetes PVC Restore

Scale HAAI to zero, restore the PVC data, then scale it back to one replica. Recreate or restore Kubernetes Secrets separately because PVC snapshots do not include Secret objects. If `existingSecret` supplies `HAAI_SECRET_FILE`, restore the same secret value that encrypted the database settings.

## SQLite

The SQLite database and its WAL/SHM files live inside `/data`. For consistent backups, stop HAAI or use an atomic storage-level snapshot. Restoring an older image without a matching database backup may fail if migrations changed the schema.
