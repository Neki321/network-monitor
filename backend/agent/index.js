const os = require("os");
const fs = require("fs");
const { exec } = require("child_process");
const { promisify } = require("util");
const mem = require("node-os-utils").mem;
const WebSocket = require("ws");

const execAsync = promisify(exec);

const SERVER_URL = process.env.SERVER_URL || "wss://aptly-sludge-unspoiled.ngrok-free.dev/agent";
const NODE_ID = process.env.NODE_ID || `${os.hostname()}-${os.platform()}`;
const METRIC_INTERVAL_MS = Number(process.env.METRIC_INTERVAL_MS || 2000);
const RECONNECT_DELAY_MS = Number(process.env.RECONNECT_DELAY_MS || 3000);

let socket = null;
let metricsInterval = null;
let reconnectTimeout = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const round = (value) => Math.round(value * 100) / 100;

function sampleCpuTimes() {
  return os.cpus().map((c) => {
    const t = c.times;
    const idle = t.idle;
    const total = Object.values(t).reduce((sum, v) => sum + (typeof v === "number" ? v : 0), 0);
    return { idle, total };
  });
}

async function getCpuUsagePercent() {
  try {
    const a = sampleCpuTimes();
    await sleep(100);
    const b = sampleCpuTimes();
    let idleDiff = 0;
    let totalDiff = 0;
    for (let i = 0; i < a.length; i++) {
      idleDiff += b[i].idle - a[i].idle;
      totalDiff += b[i].total - a[i].total;
    }
    if (totalDiff <= 0) return 0;
    const usage = (1 - idleDiff / totalDiff) * 100;
    return round(Math.min(100, Math.max(0, usage)));
  } catch {
    return 0;
  }
}

function parseLinuxDiskIoMs(content) {
  let sumMs = 0;
  for (const line of content.split("\n")) {
    const p = line.trim().split(/\s+/);
    if (p.length < 13) continue;
    const name = p[2];
    if (!name || name.startsWith("loop") || name.startsWith("ram") || name.startsWith("dm-")) continue;
    if (!/^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+)$/.test(name)) continue;
    const ioMs = Number(p[12]);
    if (Number.isFinite(ioMs)) sumMs += ioMs;
  }
  return sumMs;
}

async function getDiskIoPercent() {
  if (process.platform === "win32") {
    try {
      const cmd =
        'powershell -NoProfile -Command "Get-Counter \'\\\\PhysicalDisk(_Total)\\\\% Disk Time\' | Select-Object -ExpandProperty CounterSamples | Select-Object -ExpandProperty CookedValue"';
      const r1 = await execAsync(cmd, { windowsHide: true, timeout: 15_000 });
      const v1 = Number(String(r1.stdout).trim().split(/\r?\n/)[0]);
      await sleep(100);
      const r2 = await execAsync(cmd, { windowsHide: true, timeout: 15_000 });
      const v2 = Number(String(r2.stdout).trim().split(/\r?\n/)[0]);
      if (!Number.isFinite(v1) && !Number.isFinite(v2)) return 0;
      const out = Number.isFinite(v1) && Number.isFinite(v2) ? (v1 + v2) / 2 : Number.isFinite(v2) ? v2 : v1;
      return round(Math.min(100, Math.max(0, out)));
    } catch {
      return 0;
    }
  }
  try {
    const s1 = parseLinuxDiskIoMs(fs.readFileSync("/proc/diskstats", "utf8"));
    await sleep(100);
    const s2 = parseLinuxDiskIoMs(fs.readFileSync("/proc/diskstats", "utf8"));
    const delta = s2 - s1;
    const pct = (delta / 100) * 100;
    return round(Math.min(100, Math.max(0, pct)));
  } catch {
    return 0;
  }
}

async function tryNvidiaSmi() {
  try {
    const { stdout } = await execAsync(
      "nvidia-smi --query-gpu=utilization.gpu,temperature.gpu --format=csv,noheader,nounits",
      { windowsHide: true, timeout: 10_000 }
    );
    const lines = stdout
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return null;
    let utilSum = 0;
    let tempSum = 0;
    let tempCount = 0;
    for (const line of lines) {
      const [u, temp] = line.split(",").map((x) => x.trim());
      const util = Number(u);
      if (Number.isFinite(util)) utilSum += util;
      const t = Number(temp);
      if (Number.isFinite(t)) {
        tempSum += t;
        tempCount += 1;
      }
    }
    const gpu = round(Math.min(100, Math.max(0, utilSum / lines.length)));
    const gpuTemp = tempCount ? Math.round(tempSum / tempCount) : null;
    return { gpu, gpuTemp };
  } catch {
    return null;
  }
}

async function tryWmicGpu() {
  if (process.platform !== "win32") return null;
  try {
    const { stdout } = await execAsync("wmic path Win32_VideoController get LoadPercentage", {
      windowsHide: true,
      timeout: 15_000,
    });
    const nums = [];
    for (const line of stdout.split("\n")) {
      const t = line.trim();
      if (/^\d+$/.test(t)) nums.push(Number(t));
    }
    if (!nums.length) return null;
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    return { gpu: round(Math.min(100, Math.max(0, avg))), gpuTemp: null };
  } catch {
    return null;
  }
}

function tryAmdSysBusyPercent() {
  if (process.platform !== "linux") return null;
  const paths = ["/sys/class/drm/card0/device/gpu_busy_percent", "/sys/class/drm/card1/device/gpu_busy_percent"];
  for (const p of paths) {
    try {
      const raw = fs.readFileSync(p, "utf8").trim();
      const n = Number(raw);
      if (Number.isFinite(n)) {
        return { gpu: round(Math.min(100, Math.max(0, n))), gpuTemp: null };
      }
    } catch {
      /* continue */
    }
  }
  return null;
}

async function collectGpu() {
  const nvidia = await tryNvidiaSmi();
  if (nvidia) return nvidia;
  const wmic = await tryWmicGpu();
  if (wmic) return wmic;
  const amd = tryAmdSysBusyPercent();
  if (amd) return amd;
  return { gpu: null, gpuTemp: null };
}

function parseLinuxNetTotals(content) {
  let rx = 0;
  let tx = 0;
  const lines = content.split("\n");
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("lo:")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const rest = line.slice(colon + 1).trim().split(/\s+/);
    if (rest.length < 9) continue;
    rx += Number(rest[0]) || 0;
    tx += Number(rest[8]) || 0;
  }
  return { rx, tx };
}

async function getNetworkTotals() {
  if (process.platform === "win32") {
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "Get-NetAdapterStatistics | Select-Object ReceivedBytes,SentBytes | ConvertTo-Json -Compress"',
        { windowsHide: true, timeout: 20_000 }
      );
      const parsed = JSON.parse(stdout);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      let rx = 0;
      let tx = 0;
      for (const row of list) {
        if (!row || typeof row !== "object") continue;
        const rec = row.ReceivedBytes ?? row.receivedBytes;
        const sent = row.SentBytes ?? row.sentBytes;
        rx += Number(rec) || 0;
        tx += Number(sent) || 0;
      }
      return { rx, tx };
    } catch {
      return { rx: 0, tx: 0 };
    }
  }
  try {
    return parseLinuxNetTotals(fs.readFileSync("/proc/net/dev", "utf8"));
  } catch {
    return { rx: 0, tx: 0 };
  }
}

async function collectMetrics() {
  try {
    const gpuPromise = collectGpu();
    const netStart = await getNetworkTotals();
    const tNet0 = Date.now();

    const [ramInfo, cpu, disk] = await Promise.all([
      mem.info(),
      getCpuUsagePercent(),
      getDiskIoPercent(),
    ]);

    const ramUsed = Number(ramInfo.usedMemPercentage || 0);

    const elapsed = Date.now() - tNet0;
    if (elapsed < 1000) await sleep(1000 - elapsed);
    const netEnd = await getNetworkTotals();
    const dtSec = Math.max((Date.now() - tNet0) / 1000, 0.001);
    const drx = Math.max(0, netEnd.rx - netStart.rx);
    const dtx = Math.max(0, netEnd.tx - netStart.tx);
    const down = round(drx / 1024 / dtSec);
    const up = round(dtx / 1024 / dtSec);

    const { gpu, gpuTemp } = await gpuPromise;

    return {
      nodeId: NODE_ID,
      hostname: os.hostname(),
      cpu: cpu,
      ram: round(ramUsed),
      disk: disk,
      gpu,
      gpuTemp,
      network: { up, down },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Failed to collect metrics:", error.message);
    return null;
  }
}

async function sendMetrics() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const payload = await collectMetrics();
  if (!payload) return;
  socket.send(JSON.stringify(payload), (error) => {
    if (error) console.error("Failed to send metrics:", error.message);
  });
}

function startMetricsLoop() {
  if (metricsInterval) clearInterval(metricsInterval);
  sendMetrics();
  metricsInterval = setInterval(sendMetrics, METRIC_INTERVAL_MS);
}

function stopMetricsLoop() {
  if (!metricsInterval) return;
  clearInterval(metricsInterval);
  metricsInterval = null;
}

function scheduleReconnect() {
  if (reconnectTimeout) return;
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connect();
  }, RECONNECT_DELAY_MS);
}

function connect() {
  console.log(`Connecting to ${SERVER_URL} as ${NODE_ID}`);
  socket = new WebSocket(SERVER_URL, {
    headers: {
      "ngrok-skip-browser-warning": "true",
    },
  });

  socket.on("open", () => {
    console.log("Connected to server");
    startMetricsLoop();
  });

  socket.on("close", () => {
    console.log("Connection closed. Reconnecting...");
    stopMetricsLoop();
    scheduleReconnect();
  });

  socket.on("error", (error) => {
    console.error("WebSocket error:", error.message);
  });
}

function shutdown() {
  console.log("Shutting down agent...");
  stopMetricsLoop();
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (socket && socket.readyState === WebSocket.OPEN) socket.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

connect();
