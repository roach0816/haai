import { useEffect, useState } from "react";
import type { SystemHealth } from "../shared/types";
import { AuthGate } from "./components/AuthGate";
import { Layout } from "./components/Layout";
import { ProfileModal } from "./components/ProfileModal";
import { Dashboard } from "./pages/Dashboard";
import { Settings } from "./pages/Settings";
import { api } from "./lib/api";
import {
  applyAppearancePreference,
  getAppearancePreference,
  saveAppearancePreference,
  type AppearancePreference
} from "./lib/appearance";

export function App() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [username, setUsername] = useState<string | undefined>();
  const [page, setPage] = useState("dashboard");
  const [profileOpen, setProfileOpen] = useState(false);
  const [appearance, setAppearance] = useState<AppearancePreference>(() => getAppearancePreference());

  async function refresh() {
    const nextHealth = await api.health();
    setHealth(nextHealth);
    if (nextHealth.authenticated) {
      const me = await api.me();
      setUsername(me.username);
    } else {
      setUsername(undefined);
    }
  }

  function changeAppearance(nextAppearance: AppearancePreference) {
    setAppearance(nextAppearance);
    saveAppearancePreference(nextAppearance);
  }

  useEffect(() => {
    applyAppearancePreference(appearance);
  }, [appearance]);

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
      onProfile={() => setProfileOpen(true)}
      onLogout={async () => {
        await api.logout();
        setProfileOpen(false);
        await refresh();
      }}
    >
      {page === "settings" ? <Settings /> : <Dashboard />}
      {profileOpen ? (
        <ProfileModal
          appearance={appearance}
          onAppearanceChange={changeAppearance}
          onClose={() => setProfileOpen(false)}
          username={username}
        />
      ) : null}
    </Layout>
  );
}
