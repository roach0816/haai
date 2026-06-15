import { useEffect, useState } from "react";
import type { AppLog } from "../../shared/types";
import { api } from "../lib/api";

export function Logs() {
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setLogs(await api.listLogs(150));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logs failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main>
      <section className="page-header">
        <div>
          <p className="eyebrow">Logs</p>
          <h1>Activity log</h1>
          <p className="muted">High-level application events for analysis runs, AI provider calls, updates, and service actions.</p>
        </div>
        <button className="secondary" onClick={load} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button>
      </section>

      {error ? <p className="error">{error}</p> : null}

      <section className="log-list">
        {logs.length ? logs.map((log) => (
          <article className={`log-entry log-${log.level}`} key={log.id}>
            <div>
              <span className="status-badge neutral">{log.source}</span>
              <h3>{log.message}</h3>
              {log.details ? <pre className="log-details">{formatDetails(log.details)}</pre> : null}
            </div>
            <time>{new Date(log.createdAt).toLocaleString()}</time>
          </article>
        )) : (
          <div className="empty">
            <h2>No log entries yet</h2>
            <p>Run an analysis or use appliance controls to populate this log.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function formatDetails(details: string): string {
  try {
    return JSON.stringify(JSON.parse(details), null, 2);
  } catch {
    return details;
  }
}
