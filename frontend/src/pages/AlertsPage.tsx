import type { AlertEntry } from "../App";
import { Sidebar } from "../components/Sidebar";
import { useLanguage } from "../context/LanguageContext";
import type { NodeState } from "../hooks/useWebSocket";

type AlertsPageProps = {
  role: "admin" | "guest";
  onLogout: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  alerts: AlertEntry[];
  nodes: NodeState[];
};

export function AlertsPage({ role, onLogout, theme, onToggleTheme, alerts, nodes }: AlertsPageProps) {
  const { t, language, setLanguage } = useLanguage();

  return (
    <main className="layout">
      <Sidebar nodes={nodes} />
      <section className="content">
        <header className="page-header">
          <div>
            <h1>{t.alerts}</h1>
            <p className="muted">{role === "admin" ? t.admin : t.guestBadge}</p>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="lang-switch"
              onClick={() => setLanguage(language === "UA" ? "EN" : "UA")}
            >
              UA | EN
            </button>
            <button type="button" className="lang-switch" onClick={onToggleTheme}>
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            {role === "admin" ? (
              <button className="ghost-button" onClick={onLogout}>
                {t.logout}
              </button>
            ) : null}
          </div>
        </header>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.time}</th>
                <th>{t.node}</th>
                <th>{t.type}</th>
                <th>{t.value}</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    {t.noAlerts}
                  </td>
                </tr>
              ) : (
                alerts.map((alert, index) => (
                  <tr key={`${alert.nodeId}-${alert.type}-${alert.timestamp}-${index}`}>
                    <td>{new Date(alert.timestamp).toLocaleTimeString("uk-UA", { hour12: false })}</td>
                    <td>{alert.hostname}</td>
                    <td className={alert.type === "cpu" ? "metric-danger" : "metric-warning"}>
                      {alert.type === "cpu" ? t.cpu : t.ram}
                    </td>
                    <td className={alert.type === "cpu" ? "metric-danger" : "metric-warning"}>
                      {Math.round(alert.value)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
