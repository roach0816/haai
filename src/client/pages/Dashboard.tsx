import { useEffect, useMemo, useState } from "react";
import { suggestionCategories, type AnalysisRun, type Suggestion } from "../../shared/types";
import { SuggestionCard } from "../components/SuggestionCard";
import { api } from "../lib/api";

export function Dashboard() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("new");
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    if (status !== "all") params.set("status", status);
    const [nextSuggestions, nextRuns] = await Promise.all([api.listSuggestions(params), api.listRuns()]);
    setSuggestions(nextSuggestions);
    setRuns(nextRuns);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
  }, [category, status]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of suggestions) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return map;
  }, [suggestions]);

  const groupedSuggestions = useMemo(() => {
    const map = new Map<string, Suggestion[]>();
    for (const item of suggestionCategories) map.set(item, []);
    for (const item of suggestions) {
      map.set(item.category, [...(map.get(item.category) ?? []), item]);
    }
    return map;
  }, [suggestions]);

  const selectedSuggestion = useMemo(
    () => suggestions.find((item) => item.id === selectedSuggestionId) ?? null,
    [selectedSuggestionId, suggestions]
  );

  async function startScan() {
    setBusy(true);
    setError("");
    try {
      await api.startAnalysis();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(id: string, nextStatus: Suggestion["status"]) {
    await api.updateSuggestion(id, nextStatus);
    if (nextStatus === "dismissed") setSelectedSuggestionId(null);
    await load();
  }

  async function regenerate(id: string) {
    setBusy(true);
    try {
      await api.regenerateSuggestion(id);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (selectedSuggestion) {
    return (
      <main>
        <section className="page-header">
          <div>
            <p className="eyebrow">{selectedSuggestion.category}</p>
            <h1>{selectedSuggestion.title}</h1>
            <p className="muted">Review the evidence, YAML, install steps, and rollback path before making Home Assistant changes.</p>
          </div>
          <button className="secondary" onClick={() => setSelectedSuggestionId(null)}>Back to dashboard</button>
        </section>
        <SuggestionCard
          suggestion={selectedSuggestion}
          onStatus={updateStatus}
          onRegenerate={regenerate}
        />
      </main>
    );
  }

  return (
    <main>
      <section className="page-header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Home Assistant insights</h1>
          <p className="muted">Read-only recommendations grouped by automation impact.</p>
        </div>
        <button onClick={startScan} disabled={busy}>{busy ? "Scanning..." : "Run analysis now"}</button>
      </section>

      {error ? <p className="error">{error}</p> : null}

      <section className="stats-grid">
        <div className="stat"><strong>{suggestions.length}</strong><span>Visible suggestions</span></div>
        <div className="stat"><strong>{runs[0]?.status ?? "none"}</strong><span>Latest run</span></div>
        <div className="stat"><strong>{runs[0]?.suggestionCount ?? 0}</strong><span>Latest count</span></div>
      </section>

      <section className="toolbar">
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">All categories</option>
          {suggestionCategories.map((item) => (
            <option key={item} value={item}>{item} ({counts.get(item) ?? 0})</option>
          ))}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="new">New</option>
          <option value="copied">Copied</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All statuses</option>
        </select>
      </section>

      <section className="pillar-grid">
        {suggestions.length ? suggestionCategories.map((item) => {
          const categorySuggestions = groupedSuggestions.get(item) ?? [];
          return (
            <article className="pillar" key={item}>
              <header>
                <div>
                  <h2>{item}</h2>
                  <p className="muted">{categorySuggestions.length} suggestion{categorySuggestions.length === 1 ? "" : "s"}</p>
                </div>
                <span className="status-badge neutral">{counts.get(item) ?? 0}</span>
              </header>
              <div className="pillar-list">
                {categorySuggestions.length ? categorySuggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className={`suggestion-summary risk-${suggestion.risk}`}
                    onClick={() => setSelectedSuggestionId(suggestion.id)}
                  >
                    <span>{suggestion.title}</span>
                    <small>{suggestion.effort} effort - {suggestion.risk} risk</small>
                  </button>
                )) : (
                  <p className="muted">No visible suggestions in this category.</p>
                )}
              </div>
            </article>
          );
        }) : (
          <div className="empty">
            <h2>No suggestions yet</h2>
            <p>Configure Home Assistant and AI settings, then run the first analysis.</p>
          </div>
        )}
      </section>
    </main>
  );
}
