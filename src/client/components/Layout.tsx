import type { ReactNode } from "react";

interface Props {
  page: string;
  setPage: (page: string) => void;
  onProfile: () => void;
  onLogout: () => void;
  children: ReactNode;
}

export function Layout({ page, setPage, onProfile, onLogout, children }: Props) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">HA</span>
          <div>
            <strong>Home AI</strong>
            <span>Read-only advisor</span>
          </div>
        </div>
        <nav>
          <button className={page === "dashboard" ? "active" : ""} onClick={() => setPage("dashboard")}>
            Dashboard
          </button>
          <button className={page === "settings" ? "active" : ""} onClick={() => setPage("settings")}>
            Settings
          </button>
        </nav>
        <div className="sidebar-actions">
          <button className="ghost" onClick={onProfile}>Profile</button>
          <button className="ghost" onClick={onLogout}>Sign out</button>
        </div>
      </aside>
      <section key={page} className="content">{children}</section>
    </div>
  );
}
