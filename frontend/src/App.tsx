import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import { useWebSocket } from "./hooks/useWebSocket";
import { LoginPage } from "./pages/LoginPage";
import { AlertsPage } from "./pages/AlertsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { StatsPage } from "./pages/StatsPage";

export type AlertEntry = {
  nodeId: string;
  hostname: string;
  type: "cpu" | "ram";
  value: number;
  timestamp: string;
};

const getWsUrl = (token: string, role: "admin" | "guest", guestHostname: string) => {
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = isLocal ? "localhost:4000" : window.location.host;
  const params = new URLSearchParams();
  params.set("token", token);
  params.set("role", role);
  if (role === "guest" && guestHostname.trim()) {
    params.set("hostname", guestHostname.trim());
  }
  return `${protocol}//${host}/dashboard?${params.toString()}`;
};

function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}

function AppContent() {
  const { t } = useLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "guest" | null>(null);
  const [guestHostname, setGuestHostname] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const handleAdminLogin = (adminToken: string) => {
    setToken(adminToken);
    setRole("admin");
  };

  const handleGuestLogin = (hostname: string) => {
    setToken("guest");
    setRole("guest");
    setGuestHostname(hostname.trim());
  };

  const handleLogout = async () => {
    if (role === "admin") {
      await fetch("/api/logout", { method: "POST" });
    }
    setToken(null);
    setRole(null);
    setGuestHostname("");
  };

  useEffect(() => {
    document.body.classList.remove("theme-dark", "theme-light");
    document.body.classList.add(theme === "dark" ? "theme-dark" : "theme-light");
  }, [theme]);

  useEffect(() => {
    document.title = t.title;
  }, [t.title]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const handleAlert = (alert: AlertEntry) => {
    setAlerts((prev) => [alert, ...prev].slice(0, 100));
  };

  return token && role ? (
    <AuthenticatedRoutes
      role={role}
      token={token}
      guestHostname={guestHostname}
      theme={theme}
      onToggleTheme={toggleTheme}
      onLogout={handleLogout}
      alerts={alerts}
      onAlert={handleAlert}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
    />
  ) : (
    <Routes>
      <Route
        path="/login"
        element={
          <LoginPage onAdminLogin={handleAdminLogin} onGuestLogin={handleGuestLogin} />
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

type AuthenticatedRoutesProps = {
  role: "admin" | "guest";
  token: string;
  guestHostname: string;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onLogout: () => void;
  alerts: AlertEntry[];
  onAlert: (alert: AlertEntry) => void;
  viewMode: "cards" | "table";
  onViewModeChange: (value: "cards" | "table") => void;
};

function AuthenticatedRoutes({
  role,
  token,
  guestHostname,
  theme,
  onToggleTheme,
  onLogout,
  alerts,
  onAlert,
  viewMode,
  onViewModeChange,
}: AuthenticatedRoutesProps) {
  const { connected, nodes, historyMap, fetchNodeHistory, sendJson } = useWebSocket(
    getWsUrl(token, role, guestHostname)
  );

  return (
    <Routes>
      <Route
        path="/"
        element={
          <DashboardPage
            role={role}
            theme={theme}
            onToggleTheme={onToggleTheme}
            onLogout={onLogout}
            connected={connected}
            nodes={nodes}
            historyMap={historyMap}
            fetchNodeHistory={fetchNodeHistory}
            sendJson={sendJson}
            onAlert={onAlert}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
          />
        }
      />
      <Route
        path="/alerts"
        element={
          <AlertsPage
            role={role}
            theme={theme}
            onToggleTheme={onToggleTheme}
            onLogout={onLogout}
            alerts={alerts}
            nodes={nodes}
          />
        }
      />
      <Route
        path="/stats"
        element={
          <StatsPage
            role={role}
            theme={theme}
            onToggleTheme={onToggleTheme}
            nodes={nodes}
            historyMap={historyMap}
          />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;