import { useEffect, useMemo, useState } from "react";
import { NodeCard } from "../components/NodeCard";
import { NodeDetailsModal } from "../components/NodeDetailsModal";
import { Sidebar } from "../components/Sidebar";
import { Toast } from "../components/Toast";
import { useLanguage } from "../context/LanguageContext";
import type { NodeReading, NodeState } from "../hooks/useWebSocket";
import type { AlertEntry } from "../App";

type DashboardPageProps = {
  role: "admin" | "guest";
  onLogout: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onAlert: (alert: AlertEntry) => void;
  connected: boolean;
  nodes: NodeState[];
  historyMap: Record<string, NodeReading[]>;
  fetchNodeHistory: (nodeId: string) => Promise<NodeReading[]>;
  sendJson: (payload: object) => void;
  viewMode: "cards" | "table";
  onViewModeChange: (value: "cards" | "table") => void;
};

function formatClock(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
    2,
    "0"
  )}:${String(date.getSeconds()).padStart(2, "0")}`;
}

function getMetricLevel(value: number) {
  if (value >= 80) return "danger";
  if (value >= 60) return "warning";
  return "safe";
}

export function DashboardPage({
  role,
  onLogout,
  theme,
  onToggleTheme,
  onAlert,
  connected,
  nodes,
  historyMap,
  fetchNodeHistory,
  sendJson,
  viewMode,
  onViewModeChange,
}: DashboardPageProps) {
  const { t, language, setLanguage } = useLanguage();
  const [now, setNow] = useState(new Date());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [modalHistory, setModalHistory] = useState<typeof historyMap[string]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const [lastAlertByNode, setLastAlertByNode] = useState<Record<string, number>>({});

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const latestByNode: Record<string, number> = { ...lastAlertByNode };
    let hasUpdate = false;
    let nextMessage: string | null = null;
    const nowMs = Date.now();

    for (const node of nodes) {
      const reading = node.lastReading;
      if (!reading) continue;
      const highCpu = reading.cpu > 80;
      const highRam = reading.ram > 90;
      if (!highCpu && !highRam) continue;

      const alertType = highCpu ? "cpu" : "ram";
      const dedupeKey = `${node.nodeId}:${alertType}`;
      const lastTs = latestByNode[dedupeKey] || 0;
      if (nowMs - lastTs < 30_000) continue;

      latestByNode[dedupeKey] = nowMs;
      hasUpdate = true;
      nextMessage = highCpu
        ? `⚠️ ${node.hostname}: ${t.cpu} ${Math.round(reading.cpu)}%`
        : `⚠️ ${node.hostname}: ${t.ram} ${Math.round(reading.ram)}%`;
      onAlert({
        nodeId: node.nodeId,
        hostname: node.hostname,
        type: highCpu ? "cpu" : "ram",
        value: highCpu ? reading.cpu : reading.ram,
        timestamp: new Date().toISOString(),
      });
      break;
    }

    if (hasUpdate) {
      setLastAlertByNode(latestByNode);
      if (nextMessage) {
        setToastMessage(nextMessage);
        setToastKey((key) => key + 1);
      }
    }
  }, [nodes, t, lastAlertByNode, onAlert]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.nodeId === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const onlineCount = nodes.filter((node) => node.online).length;

  const openDetails = async (nodeId: string) => {
    setSelectedNodeId(nodeId);
    const history = await fetchNodeHistory(nodeId);
    setModalHistory(history);
  };

  return (
    <main className="layout">
      <Sidebar nodes={nodes} />
      <section className="content">
        <header className="page-header">
          <div>
            <h1>{t.title}</h1>
            <p className="muted">
              {t.nodesOnline}: {onlineCount} / {nodes.length}
            </p>
          </div>
          <div className="header-actions">
            <span className={connected ? "badge online" : "badge offline"}>
              {connected ? t.connected : t.disconnected}
            </span>
            <span className="clock">{formatClock(now)}</span>
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
            <button
              type="button"
              className="lang-switch"
              onClick={() => onViewModeChange(viewMode === "cards" ? "table" : "cards")}
            >
              🔲 {t.viewCards} | ☰ {t.viewTable}
            </button>
            {role === "admin" ? (
              <>
                <span className="badge admin-badge">{t.adminBadge}</span>
                <button className="ghost-button" onClick={onLogout}>
                  {t.logoutBtn}
                </button>
              </>
            ) : (
              <>
                <span className="badge">{t.guestBadge}</span>
                <button className="ghost-button" onClick={onLogout}>
                  {t.logoutBtn}
                </button>
              </>
            )}
          </div>
        </header>

        {viewMode === "cards" ? (
          <div className="node-grid">
            {nodes.map((node) => (
              <NodeCard
                key={node.nodeId}
                node={node}
                history={node.history ?? historyMap[node.nodeId] ?? []}
                onClick={() => openDetails(node.nodeId)}
                role={role}
                sendJson={sendJson}
              />
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t.nodes}</th>
                  <th>{t.online}</th>
                  <th>{t.cpu}</th>
                  <th>{t.ram}</th>
                  <th>{t.disk}</th>
                  <th>{t.lastUpdate}</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((node) => {
                  const reading = node.lastReading;
                  return (
                    <tr key={node.nodeId}>
                      <td>{node.hostname}</td>
                      <td>{node.online ? t.online : t.offline}</td>
                      <td className={reading ? `metric-${getMetricLevel(reading.cpu)}` : ""}>
                        {reading ? `${Math.round(reading.cpu)}%` : "--"}
                      </td>
                      <td className={reading ? `metric-${getMetricLevel(reading.ram)}` : ""}>
                        {reading ? `${Math.round(reading.ram)}%` : "--"}
                      </td>
                      <td className={reading ? `metric-${getMetricLevel(reading.disk)}` : ""}>
                        {reading ? `${Math.round(reading.disk)}%` : "--"}
                      </td>
                      <td>
                        {reading
                          ? new Date(reading.timestamp).toLocaleTimeString("uk-UA", {
                              hour12: false,
                            })
                          : "--:--:--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {toastMessage ? <Toast key={toastKey} message={toastMessage} /> : null}
      {selectedNode ? (
        <NodeDetailsModal
          node={selectedNode}
          history={modalHistory.length ? modalHistory : historyMap[selectedNode.nodeId] || []}
          onClose={() => setSelectedNodeId(null)}
        />
      ) : null}
    </main>
  );
}
