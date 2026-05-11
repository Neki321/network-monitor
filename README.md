# Network Monitor

Distributed computer network resource monitoring system for a Bachelor's thesis project.

## Architecture

Agent -> Central Server -> Web Dashboard

## Project Structure

- `backend/agent`: Collects CPU, RAM, and disk metrics and streams them to server.
- `backend/server`: Receives agent data, stores 60 readings per node, serves API and dashboard WebSocket updates.
- `frontend`: React + TypeScript dashboard for live visualization.

## Run Locally

### 1) Start server

```bash
cd backend/server
npm install
npm start
```

### 2) Start one or more agents

```bash
cd backend/agent
npm install
npm start
```

Optional environment variables:
- `SERVER_URL` (default: `ws://localhost:4000/agent`)
- `NODE_ID` (default: `<hostname>-<platform>`)

### 3) Start frontend

```bash
cd frontend
npm install
npm run dev
```

Optional environment variable:
- `VITE_DASHBOARD_WS_URL` (default: `ws://localhost:4000/dashboard`)
