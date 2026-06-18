import { useEffect, useRef, useState } from "react";
import type { SystemHealth, UpdateSettings } from "../shared/types";
import { AuthGate } from "./components/AuthGate";
import { Layout } from "./components/Layout";
import { ProfileModal } from "./components/ProfileModal";
import { AiConfiguration } from "./pages/AiConfiguration";
import { Dashboard } from "./pages/Dashboard";
import { Logs } from "./pages/Logs";
import { Settings } from "./pages/Settings";
import { api } from "./lib/api";
import {
  applyAppearancePreference,
  getAppearancePreference,
  saveAppearancePreference,
  type AppearancePreference
} from "./lib/appearance";

const healthRefreshMs = 60_000;
const updateCheckIntervalMs = 6 * 60 * 60 * 1000;

export function App() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [username, setUsername] = useState<string | undefined>();
  const [page, setPage] = useState("dashboard");
  const [profileOpen, setProfileOpen] = useState(false);
  const [appearance, setAppearance] = useState<AppearancePreference>(() => getAppearancePreference());
  const updateCheckInFlight = useRef(false);

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

  useEffect(() => {
    if (!health?.authenticated) return;
    const interval = window.setInterval(() => {
      void api.health().then(setHealth).catch(() => {
        // Keep the last known footer/update state if the API is restarting or temporarily unavailable.
      });
    }, healthRefreshMs);
    return () => window.clearInterval(interval);
  }, [health?.authenticated]);

  useEffect(() => {
    if (!health?.authenticated) return;

    async function checkForUpdatesIfReady() {
      if (updateCheckInFlight.current) return;
      updateCheckInFlight.current = true;
      try {
        const [settings, currentHealth] = await Promise.all([
          api.getUpdateSettings(),
          api.health()
        ]);
        setHealth(currentHealth);
        if (!updateSettingsReady(settings) || !updateCheckDue(currentHealth)) return;
        setHealth({
          ...currentHealth,
          update: {
            ...currentHealth.update,
            status: "checking",
            progress: { label: "Checking for updates", percent: 35 }
          }
        });
        await api.update("check");
        setHealth(await api.health());
      } catch {
        await api.health().then(setHealth).catch(() => {
          // Keep the last known footer/update state if the check overlaps an API restart.
        });
      } finally {
        updateCheckInFlight.current = false;
      }
    }

    void checkForUpdatesIfReady();
    const interval = window.setInterval(() => {
      void checkForUpdatesIfReady();
    }, updateCheckIntervalMs);
    return () => window.clearInterval(interval);
  }, [health?.authenticated]);

  if (!health) return <main className="loading">Loading Home Assistant AI...</main>;

  if (!health.setupComplete || !health.authenticated) {
    return <AuthGate setupComplete={health.setupComplete} onAuthenticated={refresh} />;
  }

  return (
    <Layout
      health={health}
      page={page}
      setPage={setPage}
      onProfile={() => setProfileOpen(true)}
      onLogout={async () => {
        await api.logout();
        setProfileOpen(false);
        await refresh();
      }}
    >
      {page === "settings" ? <Settings /> : page === "ai" ? <AiConfiguration /> : page === "logs" ? <Logs /> : <Dashboard />}
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

function updateSettingsReady(settings: UpdateSettings): boolean {
  if (settings.source === "github") {
    return Boolean(settings.githubOwner && settings.githubRepo);
  }
  return Boolean(settings.manifestUrl);
}

function updateCheckDue(health: SystemHealth): boolean {
  if (health.update.status === "applying" || health.update.status === "checking") return false;
  if (!health.update.checkedAt) return true;
  const checkedAt = new Date(health.update.checkedAt).getTime();
  if (Number.isNaN(checkedAt)) return true;
  return Date.now() - checkedAt >= updateCheckIntervalMs;
}
