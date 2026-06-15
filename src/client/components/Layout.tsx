import { useState, type ReactNode } from "react";

interface Props {
  page: string;
  setPage: (page: string) => void;
  onProfile: () => void;
  onLogout: () => void;
  children: ReactNode;
}

export function Layout({ page, setPage, onProfile, onLogout, children }: Props) {
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
      <section key={page} className="content">{children}</section>
    </div>
  );
}
