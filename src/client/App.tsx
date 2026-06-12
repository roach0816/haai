import { useEffect, useState } from "react";
import type { SystemHealth } from "../shared/types";
import { AuthGate } from "./components/AuthGate";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Settings } from "./pages/Settings";
import { api } from "./lib/api";

export function App() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [page, setPage] = useState("dashboard");

  async function refresh() {
    setHealth(await api.health());
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (!health) return <main className="loading">Loading Home Assistant AI...</main>;

  if (!health.setupComplete || !health.authenticated) {
    return <AuthGate setupComplete={health.setupComplete} onAuthenticated={refresh} />;
  }

  return (
    <Layout
      page={page}
      setPage={setPage}
      onLogout={async () => {
        await api.logout();
        await refresh();
      }}
    >
      {page === "settings" ? <Settings /> : <Dashboard />}
    </Layout>
  );
}
