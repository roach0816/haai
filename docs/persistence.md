# Persistence

HAAI is stateful.

Persistent data includes:

- SQLite database: users, sessions, settings, snapshots, analysis runs, suggestions, update state, and logs.
- Generated app secret when `HAAI_SECRET` or `HAAI_SECRET_FILE` is not used.
- Runtime configuration and certificates.
- Local update metadata and history.

Docker uses a named volume mounted at `/data`. Kubernetes uses a PVC mounted at `/data`.

Do not run multiple active HAAI replicas against the same `/data` volume. SQLite is a local single-writer database.

Deleting the Docker named volume or Kubernetes PVC deletes application state. Kubernetes manifests alone do not back up application data.
