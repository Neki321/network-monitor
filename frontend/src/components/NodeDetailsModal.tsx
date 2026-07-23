import { useEffect, useMemo } from "react";
import { ResourceChart } from "./ResourceChart";
import { useLanguage } from "../context/LanguageContext";
import type { NodeReading, NodeState } from "../hooks/useWebSocket";

type NodeDetailsModalProps = {
  node: NodeState;
  history: NodeReading[];
  onClose: () => void;
};

function formatPercent(value: number | undefined) {
  return `${Math.round(value || 0)}%`;
}

function formatDuration(fromIso?: string) {
  if (!fromIso) {
    return "--";
  }

  const diffMs = Date.now() - new Date(fromIso).getTime();
  const totalSeconds = Math.max(Math.floor(diffMs / 1000), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;
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

export function NodeDetailsModal({ node, history, onClose }: NodeDetailsModalProps) {
  const { t } = useLanguage();
  const reading = node.lastReading;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const displayTitle = node.alias?.trim() ? node.alias.trim() : node.hostname;
  const net = reading?.network ?? { up: 0, down: 0 };
  const fmtKb = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "0.00");

  const gpuPct =
    reading && reading.gpu !== null && reading.gpu !== undefined && Number.isFinite(reading.gpu)
      ? reading.gpu
      : null;

  const gpuRange = formatMinMaxLine(node.gpuMin, node.gpuMax, t.minShort, t.maxShort);

  const showGpuChart = useMemo(
    () =>
      gpuPct !== null ||
      history.some((h) => h.gpu !== null && h.gpu !== undefined && Number.isFinite(h.gpu)),
    [history, gpuPct]
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label={t.close}>
          X
        </button>

        <h3>{displayTitle}</h3>
        <p className="muted">
          {t.uptime}: {formatDuration(node.firstSeen)}
        </p>

        {reading && (
          <>
            <div className="modal-metrics">
              <div>
                <span>{t.cpu}</span>
                <strong>{formatPercent(reading.cpu)}</strong>
              </div>
              <div>
                <span>{t.ram}</span>
                <strong>{formatPercent(reading.ram)}</strong>
              </div>
              <div>
                <span>{t.disk}</span>
                <strong>{formatPercent(reading.disk)}</strong>
              </div>
            </div>

            {gpuPct !== null ? (
              <div className="modal-extra-metrics">
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

            <div className="network-block modal-network" aria-label={t.netThroughput}>
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
          </>
        )}

        <ResourceChart history={history} showDisk showGpu={showGpuChart} />
      </div>
    </div>
  );
}