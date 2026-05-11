import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type NodeReading = {
  nodeId: string;
  hostname: string;
  cpu: number;
  ram: number;
  disk: number;
  gpu?: number | null;
  gpuTemp?: number | null;
  network?: { up: number; down: number };
  timestamp: string;
};

export type NodeState = {
  nodeId: string;
  hostname: string;
  alias?: string | null;
  cpuMin?: number | null;
  cpuMax?: number | null;
  ramMin?: number | null;
  ramMax?: number | null;
  diskMin?: number | null;
  diskMax?: number | null;
  online: boolean;
  lastSeen: string;
  firstSeen: string;
  lastReading: NodeReading | null;
  history?: NodeReading[];
};

type NodesUpdateMessage = {
  type: "nodes:update";
  data: NodeState[];
  timestamp: string;
};

type NodeHistoryMap = Record<string, NodeReading[]>;

const HISTORY_LIMIT = 60;

const getApiBase = () => {
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    return "http://localhost:4000";
  }
  return `${window.location.protocol}//${window.location.host}`;
};

export function useWebSocket(url: string) {
  const [nodes, setNodes] = useState<NodeState[]>([]);
  const [connected, setConnected] = useState(false);
  const [historyMap, setHistoryMap] = useState<NodeHistoryMap>({});
  const lastTimestampsRef = useRef<Record<string, string>>({});
  const socketRef = useRef<WebSocket | null>(null);

  const sendJson = useCallback((payload: object) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  useEffect(() => {
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => {
      setConnected(false);
      socketRef.current = null;
    };
    socket.onerror = () => setConnected(false);

    socket.onmessage = async (event) => {
      try {
        const parsed = JSON.parse(event.data) as NodesUpdateMessage;
        if (parsed.type !== "nodes:update" || !Array.isArray(parsed.data)) {
          return;
        }
        const enrichedNodes = await Promise.all(
          parsed.data.map(async (node) => {
            if (Array.isArray(node.history)) {
              return { ...node, history: node.history.slice(-HISTORY_LIMIT) };
            }
            const response = await fetch(
              `${getApiBase()}/api/nodes/${encodeURIComponent(node.nodeId)}/history`
            );
            if (!response.ok) {
              return { ...node, history: [] };
            }
            const history = (await response.json()) as NodeReading[];
            return { ...node, history: history.slice(-HISTORY_LIMIT) };
          })
        );

        setNodes(enrichedNodes);
        setHistoryMap((prev) => {
          const next: NodeHistoryMap = { ...prev };

          for (const node of enrichedNodes) {
            if (Array.isArray(node.history) && node.history.length > 0) {
              next[node.nodeId] = node.history.slice(-HISTORY_LIMIT);
            } else {
              const reading = node.lastReading;
              if (!reading) {
                continue;
              }
              const lastTimestamp = lastTimestampsRef.current[node.nodeId];
              if (lastTimestamp === reading.timestamp) {
                continue;
              }
              const existing = next[node.nodeId] || [];
              next[node.nodeId] = [...existing, reading].slice(-HISTORY_LIMIT);
            }
            const latest = next[node.nodeId][next[node.nodeId].length - 1];
            if (latest) {
              lastTimestampsRef.current[node.nodeId] = latest.timestamp;
            }
          }

          return next;
        });
      } catch (error) {
        console.error("Failed to parse dashboard message:", error);
      }
    };

    return () => {
      socketRef.current = null;
      socket.close();
    };
  }, [url]);

  const sortedNodes = useMemo(
    () =>
      [...nodes].sort((a, b) =>
        (a.alias?.trim() || a.hostname).localeCompare(b.alias?.trim() || b.hostname)
      ),
    [nodes]
  );

  const fetchNodeHistory = async (nodeId: string) => {
    const response = await fetch(
      `${getApiBase()}/api/nodes/${encodeURIComponent(nodeId)}/history`
    );
    if (!response.ok) {
      return [] as NodeReading[];
    }
    const data = (await response.json()) as NodeReading[];
    return data.slice(-HISTORY_LIMIT);
  };

  return { connected, nodes: sortedNodes, historyMap, fetchNodeHistory, sendJson };
}