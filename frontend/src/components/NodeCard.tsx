import type { NodeReading, NodeState } from "../hooks/useWebSocket";
import { ResourceChart } from "./ResourceChart";
import { useLanguage } from "../context/LanguageContext";

type NodeCardProps = {
  node: NodeState;
  history: NodeReading[];
  onClick: () => void;
  role: "admin" | "guest";
  sendJson: (payload: object) => void;
};

function formatPercent(value: number | undefined) {
  return `${Math.round(value || 0)}%`;
}

function getBarClass(value: number) {
  if (value >= 80) return "danger";
  if (value >= 60) return "warning";
  return "safe";
}

function formatMinMaxLine(
  min: number | null | undefined,
  max: number | null | undefined,
  minLabel: string,
  maxLabel: string
) {
  if (min == null || max == null || !Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }
  return `${minLabel}: ${Math.round(min)}%  ${maxLabel}: ${Math.round(max)}%`;
}

export function NodeCard({ node, history, onClick, role, sendJson }: NodeCardProps) {
  const { t, language } = useLanguage();
  const reading = node.lastReading;
  const cpuAlert = (reading?.cpu || 0) > 80;
  const ramAlert = (reading?.ram || 0) > 90;
  const isAlert = cpuAlert || ramAlert;

  const displayName = node.alias?.trim() ? node.alias.trim() : node.hostname;

  const lastUpdateTime = reading
    ? new Date(reading.timestamp).toLocaleTimeString(language === "UA" ? "uk-UA" : "en-GB", {
        hour12: false,
      })
    : "--:--:--";

  const onRenameClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (role !== "admin") return;
    const initial = node.alias?.trim() || node.hostname;
    const next = window.prompt(t.renameNode, initial);
    if (next === null) return;
    sendJson({ type: "setAlias", nodeId: node.nodeId, alias: next.trim() });
  };

  const net = reading?.network ?? { up: 0, down: 0 };
  const fmtKb = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "0.00");

  const cpuRange = formatMinMaxLine(node.cpuMin, node.cpuMax, t.minShort, t.maxShort);
  const ramRange = formatMinMaxLine(node.ramMin, node.ramMax, t.minShort, t.maxShort);
  const diskRange = formatMinMaxLine(node.diskMin, node.diskMax, t.minShort, t.maxShort);

  return (
    <article className={`node-card ${isAlert ? "alert pulse" : ""}`} onClick={onClick}>
      <header className="node-card-header">
        {role === "admin" ? (
          <button type="button" className="node-title-button" onClick={onRenameClick}>
            {displayName}
          </button>
        ) : (
          <h3 className="node-title-text">{displayName}</h3>
        )}
        <span className={node.online ? "badge online" : "badge offline"}>
          {node.online ? t.online : t.offline}
        </span>
      </header>

      {reading ? (
        <>
          <div className="metric-rows">
            <div className="metric-block">
              <div className="metric-row">
                <span>{t.cpu}</span>
                <strong>{formatPercent(reading.cpu)}</strong>
                <div className="progress">
                  <div className={`progress-fill ${getBarClass(reading.cpu)}`} style={{ width: `${reading.cpu}%` }} />
                </div>
              </div>
              {cpuRange ? <p className="metric-minmax">{cpuRange}</p> : null}
            </div>
            <div className="metric-block">
              <div className="metric-row">
                <span>{t.ram}</span>
                <strong>{formatPercent(reading.ram)}</strong>
                <div className="progress">
                  <div className={`progress-fill ${getBarClass(reading.ram)}`} style={{ width: `${reading.ram}%` }} />
                </div>
              </div>
              {ramRange ? <p className="metric-minmax">{ramRange}</p> : null}
            </div>
            <div className="metric-block">
              <div className="metric-row">
                <span>{t.disk}</span>
                <strong>{formatPercent(reading.disk)}</strong>
                <div className="progress">
                  <div className={`progress-fill ${getBarClass(reading.disk)}`} style={{ width: `${reading.disk}%` }} />
                </div>
              </div>
              {diskRange ? <p className="metric-minmax">{diskRange}</p> : null}
            </div>
          </div>
          {reading.gpu != null && Number.isFinite(reading.gpu) ? (
            <p className="metric-extra">
              {t.gpu}: {Math.round(reading.gpu)}%
              {reading.gpuTemp != null && Number.isFinite(reading.gpuTemp)
                ? ` | ${t.temp}: ${Math.round(reading.gpuTemp)}°C`
                : null}
            </p>
          ) : null}
          <p className="metric-extra">
            ↑ {fmtKb(net.up)} KB/s &nbsp; ↓ {fmtKb(net.down)} KB/s
          </p>
          <p className="muted last-update">
            {t.lastUpdate}: {lastUpdateTime}
          </p>
          <ResourceChart history={history} showDisk={false} />
        </>
      ) : (
        <p className="empty-card">{t.waiting}</p>
      )}
    </article>
  );
}
