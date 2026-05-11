import { useEffect } from "react";
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label={t.close}>
          X
        </button>
        <h3>{node.hostname}</h3>
        <p className="muted">
          {t.uptime}: {formatDuration(node.firstSeen)}
        </p>
        {reading && (
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
        )}
        <ResourceChart data={history} showDisk />
      </div>
    </div>
  );
}
