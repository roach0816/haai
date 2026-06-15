import { useState, type ReactNode } from "react";
import type { SystemHealth } from "../../shared/types";

interface Props {
  health: SystemHealth;
  page: string;
  setPage: (page: string) => void;
  onProfile: () => void;
  onLogout: () => void;
  children: ReactNode;
}

export function Layout({ health, page, setPage, onProfile, onLogout, children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  function navigate(nextPage: string) {
    setPage(nextPage);
    setMenuOpen(false);
  }

  function openProfile() {
    onProfile();
    setMenuOpen(false);
  }

  function logout() {
    onLogout();
    setMenuOpen(false);
  }

  return (
    <div className={`app-shell${menuOpen ? " menu-open" : ""}`}>
      <header className="mobile-topbar">
        <button
          type="button"
          className="menu-toggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="brand compact">
          <span className="brand-mark">HA</span>
          <div>
            <strong>HAAI</strong>
          </div>
        </div>
      </header>
      <button
        type="button"
        className="mobile-menu-backdrop"
        aria-label="Close menu"
        onClick={() => setMenuOpen(false)}
      />
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">HA</span>
          <div>
            <strong>HAAI</strong>
          </div>
        </div>
        <nav>
          <button className={page === "dashboard" ? "active" : ""} onClick={() => navigate("dashboard")}>
            Dashboard
          </button>
          <button className={page === "settings" ? "active" : ""} onClick={() => navigate("settings")}>
            Settings
          </button>
          <button className={page === "ai" ? "active" : ""} onClick={() => navigate("ai")}>
            AI Configuration
          </button>
          <button className={page === "logs" ? "active" : ""} onClick={() => navigate("logs")}>
            Logs
          </button>
        </nav>
        <div className="sidebar-actions">
          <button className="ghost" onClick={openProfile}>Profile</button>
          <button className="ghost" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <section key={page} className="content">
        {children}
        <AppFooter health={health} />
      </section>
    </div>
  );
}

function AppFooter({ health }: { health: SystemHealth }) {
  const updateState = getFooterUpdateState(health);

  return (
    <footer className="app-footer">
      <span>Installed version {health.version}</span>
      <span className={`status-badge ${updateState.tone}`}>{updateState.label}</span>
    </footer>
  );
}

function getFooterUpdateState(health: SystemHealth): { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" } {
  const update = health.update;
  if (update.status === "checking") return { label: "Checking for updates", tone: "info" };
  if (update.status === "applying") return { label: "Applying update", tone: "info" };
  if (update.status === "failed") return { label: "Update check failed", tone: "danger" };
  if (update.status === "available") return { label: "Update available", tone: "warning" };

  const current = normalizeVersion(update.currentVersion || health.version);
  const available = normalizeVersion(update.availableVersion || update.currentVersion || health.version);
  if (current && available && current !== available) return { label: "Update available", tone: "warning" };
  if (update.checkedAt) return { label: "Up to date", tone: "success" };
  return { label: "Update status unknown", tone: "neutral" };
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}
