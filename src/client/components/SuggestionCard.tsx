import type { Suggestion } from "../../shared/types";

interface Props {
  suggestion: Suggestion;
  onStatus: (id: string, status: Suggestion["status"]) => void;
  onRegenerate: (id: string) => void;
}

export function SuggestionCard({ suggestion, onStatus, onRegenerate }: Props) {
  async function copyYaml() {
    if (suggestion.yaml) await navigator.clipboard.writeText(suggestion.yaml);
    onStatus(suggestion.id, "copied");
  }

  return (
    <article className={`suggestion risk-${suggestion.risk}`}>
      <header>
        <div>
          <p className="eyebrow">{suggestion.category}</p>
          <h3>{suggestion.title}</h3>
        </div>
        <span className="pill">{Math.round(suggestion.confidence * 100)}%</span>
      </header>
      <p>{suggestion.rationale}</p>
      <div className="meta-row">
        <span>Effort: {suggestion.effort}</span>
        <span>Risk: {suggestion.risk}</span>
        <span>Status: {suggestion.status}</span>
      </div>
      <div className="evidence">
        {suggestion.evidence.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      {suggestion.yaml ? <pre>{suggestion.yaml}</pre> : <p className="muted">No YAML required for this recommendation.</p>}
      <div className="steps">
        <h4>Install</h4>
        <ol>
          {suggestion.installSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <h4>Rollback</h4>
        <ol>
          {suggestion.rollbackSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <footer>
        <button onClick={copyYaml}>{suggestion.yaml ? "Copy YAML" : "Mark reviewed"}</button>
        <button className="secondary" onClick={() => onRegenerate(suggestion.id)}>Regenerate</button>
        <button className="ghost" onClick={() => onStatus(suggestion.id, "dismissed")}>Dismiss</button>
      </footer>
    </article>
  );
}
