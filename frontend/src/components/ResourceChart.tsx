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
type ResourceChartProps = {
  history?: Array<{ cpu: number; ram: number; disk: number; timestamp: string }>;
  data?: Array<{ cpu: number; ram: number; disk: number; timestamp: string }>;
  showDisk?: boolean;
};

export function ResourceChart({ history = [], data: fallbackData, showDisk = true }: ResourceChartProps) {
  const source = history.length ? history : fallbackData || [];
  const data = source.map((h) => ({
    time: new Date(h.timestamp).toLocaleTimeString("uk-UA"),
    cpu: h.cpu,
    ram: h.ram,
    disk: h.disk,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#94a3b8" }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="cpu" stroke="#f97316" dot={false} name="CPU" />
        <Line type="monotone" dataKey="ram" stroke="#3b82f6" dot={false} name="RAM" />
        {showDisk ? <Line type="monotone" dataKey="disk" stroke="#22c55e" dot={false} name="Disk" /> : null}
      </LineChart>
    </ResponsiveContainer>
  );
}
