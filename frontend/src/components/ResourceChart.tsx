import { useMemo } from "react";
import {
  Line,
  LineChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLanguage } from "../context/LanguageContext";
import type { NodeReading } from "../hooks/useWebSocket";

type ResourceChartProps = {
  history?: NodeReading[];
  data?: NodeReading[];
  showDisk?: boolean;
  showGpu?: boolean;
};

export function ResourceChart({
  history = [],
  data: fallbackData,
  showDisk = true,
  showGpu = false,
}: ResourceChartProps) {
  const { t, language } = useLanguage();
  const source = history.length ? history : fallbackData || [];
  const locale = language === "UA" ? "uk-UA" : "en-GB";

  const data = useMemo(
    () =>
      source.map((h) => ({
        time: new Date(h.timestamp).toLocaleTimeString(locale, { hour12: false }),
        cpu: h.cpu,
        ram: h.ram,
        disk: h.disk,
        gpu:
          h.gpu !== null && h.gpu !== undefined && Number.isFinite(h.gpu) ? Number(h.gpu) : null,
      })),
    [source, locale]
  );

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#94a3b8" }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="cpu" stroke="#f97316" dot={false} name={t.cpu} />
        <Line type="monotone" dataKey="ram" stroke="#3b82f6" dot={false} name={t.ram} />
        {showDisk ? <Line type="monotone" dataKey="disk" stroke="#22c55e" dot={false} name={t.disk} /> : null}
        {showGpu ? (
          <Line
            type="monotone"
            dataKey="gpu"
            stroke="#a855f7"
            dot={false}
            name={t.gpu}
            connectNulls={false}
          />
        ) : null}
      </LineChart>
    </ResponsiveContainer>
  );
}
