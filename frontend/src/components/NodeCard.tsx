import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
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

  const [aliasEditing, setAliasEditing] = useState(false);
  const [aliasDraft, setAliasDraft] = useState("");
  const aliasInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aliasEditing) return;
    aliasInputRef.current?.focus();
    aliasInputRef.current?.select();
  }, [aliasEditing]);

  useEffect(() => {
    setAliasEditing(false);
  }, [node.nodeId]);

  const lastUpdateTime = reading
    ? new Date(reading.timestamp).toLocaleTimeString(language === "UA" ? "uk-UA" : "en-GB", {
        hour12: false,
      })
    : "--:--:--";

  const beginAliasEdit = (event: MouseEvent) => {
    event.stopPropagation();
    if (role !== "admin") return;
    setAliasDraft(node.alias?.trim() || node.hostname);
    setAliasEditing(true);
  };

  const cancelAliasEdit = (event: MouseEvent) => {
    event.stopPropagation();
    setAliasEditing(false);
  };

  const confirmAliasEdit = (event?: MouseEvent) => {
    event?.stopPropagation();
    if (role !== "admin") return;
    sendJson({ type: "setAlias", nodeId: node.nodeId, alias: aliasDraft.trim() });
    setAliasEditing(false);
  };

  const onAliasKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      confirmAliasEdit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setAliasEditing(false);
    }
  };

  const net = reading?.network ?? { up: 0, down: 0 };
  const fmtKb = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "0.00");

  const cpuRange = formatMinMaxLine(node.cpuMin, node.cpuMax, t.minShort, t.maxShort);
  const ramRange = formatMinMaxLine(node.ramMin, node.ramMax, t.minShort, t.maxShort);
  const diskRange = formatMinMaxLine(node.diskMin, node.diskMax, t.minShort, t.maxShort);
  const gpuRange = formatMinMaxLine(node.gpuMin, node.gpuMax, t.minShort, t.maxShort);

  const gpuPct =
    reading && reading.gpu !== null && reading.gpu !== undefined && Number.isFinite(reading.gpu)
      ? reading.gpu
      : null;

  const showGpuChart =
    gpuPct !== null ||
    history.some((h) => h.gpu !== null && h.gpu !== undefined && Number.isFinite(h.gpu));

  return (
    <article className={`node-card ${isAlert ? "alert pulse" : ""}`} onClick={onClick}>
      <header className="node-card-header">
        {role === "admin" ? (
          aliasEditing ? (
            <div className="node-alias-editor" onClick={(e) => e.stopPropagation()}>
              <input
                ref={aliasInputRef}
                type="text"
                className="node-alias-input"
                value={aliasDraft}
                onChange={(e) => setAliasDraft(e.target.value)}
                onKeyDown={onAliasKeyDown}
                aria-label={t.renameNode}
              />
              <button
                type="button"
                className="node-alias-icon-btn"
                onClick={confirmAliasEdit}
                aria-label={t.saveAlias}
                title={t.saveAlias}
              >
                ✓
              </button>
              <button
                type="button"
                className="node-alias-icon-btn"
                onClick={cancelAliasEdit}
                aria-label={t.close}
                title={t.close}
              >
                ✕
              </button>
            </div>
          ) : (
            <button type="button" className="node-title-button" onClick={beginAliasEdit}>
              {displayName}
            </button>
          )
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

            {gpuPct !== null ? (
              <div className="metric-block">
                <div className="metric-row">
                  <span>{t.gpu}</span>
                  <strong>{formatPercent(gpuPct)}</strong>
                  <div className="progress">
                    <div
                      className={`progress-fill ${getBarClass(gpuPct)}`}
                      style={{ width: `${gpuPct}%` }}
                    />
                  </div>
                </div>
                {gpuRange ? <p className="metric-minmax">{gpuRange}</p> : null}
                {reading.gpuTemp !== null &&
                reading.gpuTemp !== undefined &&
                Number.isFinite(reading.gpuTemp) ? (
                  <p className="metric-gpu-temp">
                    {t.temp}: {Math.round(reading.gpuTemp)}°C
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="network-block" aria-label={t.netThroughput}>
            <div className="network-line">
              <span className="network-line-start">
                <span className="network-arrow" aria-hidden>
                  ↑
                </span>
                <span className="network-label">{t.netUpload}</span>
              </span>
              <span className="network-value-wrap">
                <span className="network-num">{fmtKb(net.up)}</span>
                <span className="network-unit">KB/s</span>
              </span>
            </div>

            <div className="network-line">
              <span className="network-line-start">
                <span className="network-arrow" aria-hidden>
                  ↓
                </span>
                <span className="network-label">{t.netDownload}</span>
              </span>
              <span className="network-value-wrap">
                <span className="network-num">{fmtKb(net.down)}</span>
                <span className="network-unit">KB/s</span>
              </span>
            </div>
          </div>

          <p className="muted last-update">
            {t.lastUpdate}: {lastUpdateTime}
          </p>

          <ResourceChart history={history} showDisk={false} showGpu={showGpuChart} />
        </>
      ) : (
        <p className="empty-card">{t.waiting}</p>
      )}
    </article>
  );
}