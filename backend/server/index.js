const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 4000);
const HISTORY_LIMIT = 60;
const OFFLINE_AFTER_MS = 10_000;
const ADMIN_USER = {
  login: "admin",
  password: "admin123",
  token: "vntu-admin-2026",
  role: "admin",
};

const app = express();
const server = http.createServer(app);
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

const wss = new WebSocketServer({ server });

const agentClients = new Set();
const dashboardClients = new Set();
const nodeStore = new Map();
const nodeMetricsMinMax = new Map();
const nodeAliases = new Map();

function coerceNullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function ensureMinMaxEntry(nodeId) {
  if (!nodeMetricsMinMax.has(nodeId)) {
    nodeMetricsMinMax.set(nodeId, {
      cpuMin: null,
      cpuMax: null,
      ramMin: null,
      ramMax: null,
      diskMin: null,
      diskMax: null,
    });
  }
  return nodeMetricsMinMax.get(nodeId);
}

function updateMinMaxForReading(nodeId, reading) {
  const mm = ensureMinMaxEntry(nodeId);
  const apply = (key, minKey, maxKey) => {
    const v = reading[key];
    if (!Number.isFinite(v)) {
      return;
    }
    if (mm[minKey] == null) {
      mm[minKey] = v;
      mm[maxKey] = v;
      return;
    }
    mm[minKey] = Math.min(mm[minKey], v);
    mm[maxKey] = Math.max(mm[maxKey], v);
  };
  apply("cpu", "cpuMin", "cpuMax");
  apply("ram", "ramMin", "ramMax");
  apply("disk", "diskMin", "diskMax");
}

function toNodeResponse(nodeState) {
  const mm = nodeMetricsMinMax.get(nodeState.nodeId) || {};
  const alias = nodeAliases.has(nodeState.nodeId) ? nodeAliases.get(nodeState.nodeId) : null;
  return {
    nodeId: nodeState.nodeId,
    hostname: nodeState.hostname,
    alias,
    cpuMin: mm.cpuMin ?? null,
    cpuMax: mm.cpuMax ?? null,
    ramMin: mm.ramMin ?? null,
    ramMax: mm.ramMax ?? null,
    diskMin: mm.diskMin ?? null,
    diskMax: mm.diskMax ?? null,
    online: Date.now() - nodeState.lastSeenMs <= OFFLINE_AFTER_MS,
    lastSeen: new Date(nodeState.lastSeenMs).toISOString(),
    firstSeen: new Date(nodeState.firstSeenMs).toISOString(),
    lastReading: nodeState.lastReading,
  };
}

function buildNodesPayloadForClient(client) {
  const isAdmin = client._role === "admin";
  const guestHostname = (client._guestHostname || "").trim();
  let nodes = Array.from(nodeStore.values()).map(toNodeResponse);
  if (!isAdmin) {
    if (!guestHostname) {
      nodes = [];
    } else {
      const needle = guestHostname.toLowerCase();
      nodes = nodes.filter((n) => {
        const id = String(n.nodeId || "").toLowerCase();
        return id.includes(needle);
      });
    }
  }
  return {
    type: "nodes:update",
    data: nodes,
    timestamp: new Date().toISOString(),
  };
}

function broadcastToDashboards() {
  dashboardClients.forEach((client) => {
    if (client.readyState === 1) {
      const payload = buildNodesPayloadForClient(client);
      client.send(JSON.stringify(payload));
    }
  });
}

function upsertNodeReading(reading) {
  const nowMs = Date.now();
  const safeNodeId = String(reading.nodeId || "");
  if (!safeNodeId) {
    return;
  }

  const existing =
    nodeStore.get(safeNodeId) || {
      nodeId: safeNodeId,
      hostname: reading.hostname || safeNodeId,
      history: [],
      lastSeenMs: nowMs,
      firstSeenMs: nowMs,
      lastReading: null,
    };

  const net = reading.network && typeof reading.network === "object" ? reading.network : {};
  const normalizedReading = {
    nodeId: safeNodeId,
    hostname: reading.hostname || existing.hostname || safeNodeId,
    cpu: Number(reading.cpu || 0),
    ram: Number(reading.ram || 0),
    disk: Number(reading.disk || 0),
    gpu: coerceNullableNumber(reading.gpu),
    gpuTemp: coerceNullableNumber(reading.gpuTemp),
    network: {
      up: Number(net.up) || 0,
      down: Number(net.down) || 0,
    },
    timestamp: reading.timestamp || new Date(nowMs).toISOString(),
  };

  updateMinMaxForReading(safeNodeId, normalizedReading);

  existing.hostname = normalizedReading.hostname;
  existing.lastSeenMs = nowMs;
  existing.lastReading = normalizedReading;
  existing.history.push(normalizedReading);
  if (existing.history.length > HISTORY_LIMIT) {
    existing.history = existing.history.slice(-HISTORY_LIMIT);
  }

  nodeStore.set(safeNodeId, existing);
}

app.get("/api/nodes", (_req, res) => {
  const nodes = Array.from(nodeStore.values()).map(toNodeResponse);
  res.json(nodes);
});

app.get("/api/nodes/:id/history", (req, res) => {
  const node = nodeStore.get(req.params.id);
  if (!node) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  res.json(node.history);
});

app.post("/api/login", (req, res) => {
  const { login, password } = req.body || {};
  if (login === ADMIN_USER.login && password === ADMIN_USER.password) {
    res.json({ token: ADMIN_USER.token, role: ADMIN_USER.role });
    return;
  }
  res.status(401).json({ error: "Invalid credentials" });
});

app.post("/api/logout", (_req, res) => {
  res.json({ ok: true });
});

wss.on("connection", (socket, request) => {
  const requestUrl = request.url || "";

  if (requestUrl.startsWith("/agent")) {
    agentClients.add(socket);

    socket.on("message", (rawData) => {
      try {
        const reading = JSON.parse(rawData.toString());
        upsertNodeReading(reading);
        broadcastToDashboards();
      } catch (error) {
        console.error("Invalid agent payload:", error.message);
      }
    });

    socket.on("close", () => {
      agentClients.delete(socket);
    });

    return;
  }

  if (requestUrl.startsWith("/dashboard")) {
    const queryString = requestUrl.includes("?") ? requestUrl.split("?")[1] : "";
    const params = new URLSearchParams(queryString);
    const token = params.get("token") || "";
    const roleParam = (params.get("role") || "").trim().toLowerCase();
    const guestHostname = (params.get("hostname") || "").trim();
    const isAdmin = token === ADMIN_USER.token;

    socket._role = isAdmin ? "admin" : "guest";
    socket._guestHostname = isAdmin ? "" : guestHostname;
    socket._queryRole = roleParam;
    dashboardClients.add(socket);

    console.log(
      `Dashboard connected: role=${socket._role} queryRole=${roleParam || "(none)"} hostname=${guestHostname || "(none)"}`
    );

    socket.send(JSON.stringify(buildNodesPayloadForClient(socket)));

    socket.on("message", (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());
        if (msg.type !== "setAlias" || socket._role !== "admin") {
          return;
        }
        const nodeId = String(msg.nodeId || "").trim();
        const alias = String(msg.alias || "").trim();
        if (!nodeId) {
          return;
        }
        if (alias) {
          nodeAliases.set(nodeId, alias);
        } else {
          nodeAliases.delete(nodeId);
        }
        broadcastToDashboards();
      } catch (error) {
        console.error("Invalid dashboard message:", error.message);
      }
    });

    socket.on("close", () => {
      dashboardClients.delete(socket);
    });
    return;
  }

  socket.close(1008, "Unsupported WebSocket route");
});

setInterval(() => {
  broadcastToDashboards();
}, 2_000);

const path = require('path');
app.use(express.static(path.join(__dirname, '../../frontend/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

server.listen(PORT, () => {
  console.log(`Central server listening on http://localhost:${PORT}`);
  console.log(`Agent WebSocket endpoint: ws://localhost:${PORT}/agent`);
  console.log(`Dashboard WebSocket endpoint: ws://localhost:${PORT}/dashboard`);
});