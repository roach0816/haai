import type { ReactNode } from "react";

interface Props {
  page: string;
  setPage: (page: string) => void;
  onLogout: () => void;
  children: ReactNode;
}

export function Layout({ page, setPage, onLogout, children }: Props) {
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
        <button className="ghost" onClick={onLogout}>Sign out</button>
      </aside>
      <section key={page} className="content">{children}</section>
    </div>
  );
}
