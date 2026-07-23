import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Sidebar } from "../components/Sidebar";
import { useLanguage } from "../context/LanguageContext";
import type { NodeReading, NodeState } from "../hooks/useWebSocket";

type StatsPageProps = {
  role: "admin" | "guest";
  theme: "dark" | "light";
  onToggleTheme: () => void;
  nodes: NodeState[];
  historyMap: Record<string, NodeReading[]>;
};

function avg(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function StatsPage({ role, theme, onToggleTheme, nodes, historyMap }: StatsPageProps) {
  const { t, language, setLanguage } = useLanguage();

  const rows = nodes.map((node) => {
    const history = node.history ?? historyMap[node.nodeId] ?? [];
    const cpu = history.map((item) => item.cpu);
    const ram = history.map((item) => item.ram);
    const gpu = history
      .map((item) => item.gpu)
      .filter((g): g is number => g !== null && g !== undefined && Number.isFinite(g));
    return {
      nodeId: node.nodeId,
      hostname: node.hostname,
      cpuAvg: avg(cpu),
      cpuMax: cpu.length ? Math.max(...cpu) : 0,
      ramAvg: avg(ram),
      ramMax: ram.length ? Math.max(...ram) : 0,
      gpuAvg: gpu.length ? avg(gpu) : null,
      gpuMax: gpu.length ? Math.max(...gpu) : null,
    };
  });

  return (
    <main className="layout">
      <Sidebar nodes={nodes} />
      <section className="content">
        <header className="page-header">
          <div>
            <h1>{t.stats}</h1>
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
          </div>
        </header>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.nodes}</th>
                <th>{t.avgCpu}</th>
                <th>{t.maxCpu}</th>
                <th>{t.avgRam}</th>
                <th>{t.maxRam}</th>
                <th>{t.avgGpu}</th>
                <th>{t.maxGpu}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.nodeId}>
                  <td>{row.hostname}</td>
                  <td>{row.cpuAvg.toFixed(1)}%</td>
                  <td>{row.cpuMax.toFixed(1)}%</td>
                  <td>{row.ramAvg.toFixed(1)}%</td>
                  <td>{row.ramMax.toFixed(1)}%</td>
                  <td>{row.gpuAvg != null ? `${row.gpuAvg.toFixed(1)}%` : "—"}</td>
                  <td>{row.gpuMax != null ? `${row.gpuMax.toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="stats-chart">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="hostname" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="cpuAvg" fill="#f97316" name={t.avgCpu} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </main>
  );
}
