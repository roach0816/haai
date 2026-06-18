# Persistence

HAAI is stateful.

Persistent data includes:

- SQLite database: users, sessions, settings, snapshots, analysis runs, suggestions, update state, and logs.
- Generated app secret when `HAAI_SECRET` or `HAAI_SECRET_FILE` is not used.
- Runtime configuration and certificates.
- Local update metadata and history.
- SQLite WAL/SHM files used while the database is active.

Docker uses a named volume mounted at `/data`. Kubernetes uses a PVC mounted at `/data`.

Do not run multiple active HAAI replicas against the same `/data` volume. SQLite is a local single-writer database.

The container runs as UID/GID `10001`. Persistent storage must allow that identity, or the Kubernetes `fsGroup`, to read and write `/data`.

Storage must provide reliable filesystem locking. Local volumes and block-backed CSI storage are preferred. NFS-backed PVCs may work, but locking, latency, power-loss recovery, and SQLite WAL behavior must be validated for the specific NFS server and mount configuration.

If `HAAI_SECRET_FILE` is supplied through Docker or a Kubernetes Secret, keep the value stable for the lifetime of the database. Losing or replacing it can make Home Assistant tokens, AI provider keys, and other encrypted settings unreadable. Back up Kubernetes Secret objects separately from the PVC.

Deleting the Docker named volume or Kubernetes PVC deletes application state. Kubernetes manifests alone do not back up application data.

See [Backup and Restore](backup-restore.md) for consistent backup and restore procedures.
