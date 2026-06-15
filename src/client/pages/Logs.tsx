import { useEffect, useState } from "react";
import type { AppLog, AppLogPage } from "../../shared/types";
import { api } from "../lib/api";

const pageSizeOptions = [10, 25, 50] as const;

export function Logs() {
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof pageSizeOptions)[number]>(25);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(nextPage = page, nextPageSize = pageSize) {
    setLoading(true);
    setError("");
    try {
      const result = await api.listLogs(nextPage, nextPageSize);
      setLogPage(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logs failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [page, pageSize]);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const firstVisible = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastVisible = Math.min(page * pageSize, total);

  function setLogPage(result: AppLogPage) {
    setLogs(result.items);
    setTotal(result.total);
    if (result.total > 0 && result.items.length === 0 && result.page > 1) {
      setPage(Math.max(Math.ceil(result.total / result.pageSize), 1));
    }
  }

  function changePageSize(value: number) {
    const nextPageSize = pageSizeOptions.includes(value as (typeof pageSizeOptions)[number])
      ? value as (typeof pageSizeOptions)[number]
      : 25;
    setPageSize(nextPageSize);
    setPage(1);
  }

  return (
    <main>
      <section className="page-header">
        <div>
          <p className="eyebrow">Logs</p>
          <h1>Activity log</h1>
          <p className="muted">High-level application events for analysis runs, AI provider calls, updates, and service actions.</p>
        </div>
        <button className="secondary" onClick={() => load()} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button>
      </section>

      {error ? <p className="error">{error}</p> : null}

      <section className="pagination-bar" aria-label="Log pagination controls">
        <label>
          Rows per page
          <select value={pageSize} onChange={(event) => changePageSize(Number(event.target.value))}>
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <p className="muted">
          {total ? `Showing ${firstVisible}-${lastVisible} of ${total}` : "No log entries"}
        </p>
        <div className="pagination-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => setPage((current) => Math.max(current - 1, 1))}
            disabled={loading || page <= 1}
          >
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            type="button"
            className="secondary"
            onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
            disabled={loading || page >= totalPages}
          >
            Next
          </button>
        </div>
      </section>

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
