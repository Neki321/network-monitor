const os = require("os");
const fs = require("fs");
const { exec } = require("child_process");
const { promisify } = require("util");
const osu = require("node-os-utils");
const mem = osu.mem;
const WebSocket = require("ws");

const execAsync = promisify(exec);

const SERVER_URL =
  process.env.SERVER_URL || "wss://aptly-sludge-unspoiled.ngrok-free.dev/agent";
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
    const total = Object.values(t).reduce(
      (sum, v) => sum + (typeof v === "number" ? v : 0),
      0
    );
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

async function getDiskUsagePercent() {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "$d = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null -and $_.Free -ne $null } | Select-Object -First 1 Used,Free; if ($d) { [math]::Round(($d.Used / ($d.Used + $d.Free)) * 100, 2) }"',
        { windowsHide: true, timeout: 15000 }
      );

      const value = Number(String(stdout).trim().replace(",", "."));
      if (Number.isFinite(value)) {
        return round(Math.min(100, Math.max(0, value)));
      }
      return 0;
    }

    const { stdout } = await execAsync(
      "df -k / | tail -1 | awk '{print $5}' | tr -d '%'",
      { timeout: 10000 }
    );

    const value = Number(String(stdout).trim().replace(",", "."));
    if (Number.isFinite(value)) {
      return round(Math.min(100, Math.max(0, value)));
    }

    return 0;
  } catch {
    return 0;
  }
}

async function tryExec(command, options = {}) {
  try {
    return await execAsync(command, options);
  } catch (error) {
    return {
      stdout: "",
      stderr: error?.stderr || error?.message || "",
      error,
    };
  }
}

async function tryNvidiaSmi() {
  const commands = [
    'nvidia-smi --query-gpu=utilization.gpu,temperature.gpu --format=csv,noheader,nounits',
    '"C:\\Windows\\System32\\nvidia-smi.exe" --query-gpu=utilization.gpu,temperature.gpu --format=csv,noheader,nounits',
    '"C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe" --query-gpu=utilization.gpu,temperature.gpu --format=csv,noheader,nounits',
  ];

  for (const command of commands) {
    const { stdout } = await tryExec(command, {
      windowsHide: true,
      timeout: 10000,
    });

    const lines = String(stdout)
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (!lines.length) {
      continue;
    }

    let bestGpu = null;
    let bestTemp = null;

    for (const line of lines) {
      const [u, temp] = line.split(",").map((x) => x.trim());
      const util = Number(String(u).replace(",", "."));
      const t = Number(String(temp).replace(",", "."));

      if (Number.isFinite(util)) {
        if (bestGpu === null || util > bestGpu) {
          bestGpu = util;
          bestTemp = Number.isFinite(t) ? t : null;
        }
      }
    }

    if (bestGpu !== null) {
      return {
        gpu: round(Math.min(100, Math.max(0, bestGpu))),
        gpuTemp: bestTemp !== null ? Math.round(bestTemp) : null,
      };
    }
  }

  return null;
}

async function tryWindowsGpuPerfCounter() {
  if (process.platform !== "win32") return null;

  const psScript = `
$ErrorActionPreference = 'Stop'
$samples = (Get-Counter "\\GPU Engine(*engtype_3D)\\Utilization Percentage").CounterSamples
if (-not $samples) { exit 0 }
$values = $samples |
  Where-Object { $_.CookedValue -ge 0 } |
  Select-Object -ExpandProperty CookedValue
if (-not $values) { exit 0 }
$max = ($values | Measure-Object -Maximum).Maximum
if ($null -ne $max) { [math]::Round($max, 2) }
`.trim();

  const escaped = psScript.replace(/"/g, '\\"').replace(/\r?\n/g, "; ");
  const { stdout } = await tryExec(
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "${escaped}"`,
    {
      windowsHide: true,
      timeout: 15000,
    }
  );

  const raw = String(stdout).trim();
  if (!raw) return null;

  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value)) return null;

  return {
    gpu: round(Math.min(100, Math.max(0, value))),
    gpuTemp: null,
  };
}

async function tryWindowsGpuPerfCounterExtended() {
  if (process.platform !== "win32") return null;

  const psScript = `
$ErrorActionPreference = 'Stop'
$samples = (Get-Counter "\\GPU Engine(*)\\Utilization Percentage").CounterSamples |
  Where-Object {
    $_.Path -match "engtype_3D|engtype_Compute|engtype_VideoDecode|engtype_VideoEncode|engtype_Copy"
  }
if (-not $samples) { exit 0 }
$values = $samples |
  Where-Object { $_.CookedValue -ge 0 } |
  Select-Object -ExpandProperty CookedValue
if (-not $values) { exit 0 }
$max = ($values | Measure-Object -Maximum).Maximum
if ($null -ne $max) { [math]::Round($max, 2) }
`.trim();

  const escaped = psScript.replace(/"/g, '\\"').replace(/\r?\n/g, "; ");
  const { stdout } = await tryExec(
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "${escaped}"`,
    {
      windowsHide: true,
      timeout: 20000,
    }
  );

  const raw = String(stdout).trim();
  if (!raw) return null;

  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value)) return null;

  return {
    gpu: round(Math.min(100, Math.max(0, value))),
    gpuTemp: null,
  };
}

async function tryWmicGpu() {
  if (process.platform !== "win32") return null;

  try {
    const { stdout } = await execAsync(
      "wmic path Win32_VideoController get LoadPercentage",
      {
        windowsHide: true,
        timeout: 15000,
      }
    );

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

  const paths = [
    "/sys/class/drm/card0/device/gpu_busy_percent",
    "/sys/class/drm/card1/device/gpu_busy_percent",
    "/sys/class/drm/card2/device/gpu_busy_percent",
  ];

  let best = null;

  for (const p of paths) {
    try {
      const raw = fs.readFileSync(p, "utf8").trim();
      const n = Number(raw);

      if (Number.isFinite(n)) {
        const safe = round(Math.min(100, Math.max(0, n)));
        if (best === null || safe > best) {
          best = safe;
        }
      }
    } catch {}
  }

  if (best === null) return null;
  return { gpu: best, gpuTemp: null };
}

async function collectGpu() {
  const nvidia = await tryNvidiaSmi();
  if (nvidia) {
    console.log("[GPU] source=nvidia-smi", nvidia);
    return nvidia;
  }

  const winPerf3d = await tryWindowsGpuPerfCounter();
  if (winPerf3d) {
    console.log("[GPU] source=windows-perfcounter-3d", winPerf3d);
    return winPerf3d;
  }

  const winPerfExtended = await tryWindowsGpuPerfCounterExtended();
  if (winPerfExtended) {
    console.log("[GPU] source=windows-perfcounter-extended", winPerfExtended);
    return winPerfExtended;
  }

  const wmic = await tryWmicGpu();
  if (wmic) {
    console.log("[GPU] source=wmic", wmic);
    return wmic;
  }

  const amd = tryAmdSysBusyPercent();
  if (amd) {
    console.log("[GPU] source=linux-amd-sysfs", amd);
    return amd;
  }

  console.log("[GPU] source=none");
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
        { windowsHide: true, timeout: 20000 }
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
      getDiskUsagePercent(),
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
      cpu,
      ram: round(ramUsed),
      disk,
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