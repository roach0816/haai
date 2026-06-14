import { FormEvent, useState } from "react";
import { api } from "../lib/api";

interface Props {
  setupComplete: boolean;
  onAuthenticated: () => void;
}

export function AuthGate({ setupComplete, onAuthenticated }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (setupComplete) {
        await api.login({ username, password });
      } else {
        await api.setup({ username, password });
      }
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div>
          <p className="eyebrow">Home Assistant AI</p>
          <h1>{setupComplete ? "Sign in" : "Create local admin"}</h1>
          <p className="muted">
            {setupComplete
              ? "Use the local appliance account."
              : "This account protects Home Assistant metadata and AI provider keys."}
          </p>
        </div>
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button disabled={busy}>{busy ? "Working..." : setupComplete ? "Sign in" : "Create account"}</button>
      </form>
    </main>
  );
}
