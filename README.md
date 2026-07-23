# Network Monitor

A simple distributed system for monitoring computer resource usage in real time.  
This project was created as a Bachelor's thesis and shows how multiple computers can send their hardware metrics to one central server, where the data is displayed in a web dashboard.

<img width="1280" height="630" alt="image" src="https://github.com/user-attachments/assets/9a1979c9-b44a-4f48-acbd-89a25c34a9bf" />

## What this project does

The system helps monitor the condition of computers in a network.

Each monitored computer runs a small **agent** that collects basic system metrics such as:

- CPU usage
- RAM usage
- Disk usage
- Network activity
- GPU usage and temperature (if available)

These metrics are sent to a **central server**, and the server pushes updates to a **web dashboard** where the current state of all connected nodes can be viewed live.

## Why this project exists

The goal of this project is to show a lightweight and understandable approach to distributed monitoring without using heavy enterprise tools.

It can be used as:

- a Bachelor's thesis project
- a demo of real-time monitoring
- a simple prototype for monitoring computers in a lab, office, or local network

## Architecture

The project has three main parts:

```text
Agent -> Central Server -> Web Dashboard
```

### 1. Agent
The agent runs on a monitored computer.  
It collects resource usage data and sends it to the server through WebSocket.

### 2. Central Server
The server receives data from agents, keeps recent readings for each node, and sends live updates to the dashboard.

### 3. Web Dashboard
The dashboard is a React + TypeScript frontend that shows node status and live resource charts in the browser.

## Project structure

```text
backend/
  agent/      Agent application
  server/     Central server

frontend/     Web dashboard
```

## Technologies used

### Backend
- Node.js
- WebSocket (`ws`)
- node-os-utils

### Frontend
- React
- TypeScript
- Vite
- CSS

## How to run the project locally

Before you start, make sure you have:

- Node.js installed
- npm installed

### 1. Start the server

```bash
cd backend/server
npm install
npm start
```

### 2. Start the agent

Open a new terminal:

```bash
cd backend/agent
npm install
npm start
```

Optional environment variables for the agent:

- `SERVER_URL` — default: `ws://localhost:4000/agent`
- `NODE_ID` — default: `<hostname>-<platform>`
- `METRIC_INTERVAL_MS` — default: `2000`
- `RECONNECT_DELAY_MS` — default: `3000`

### 3. Start the frontend

Open one more terminal:

```bash
cd frontend
npm install
npm run dev
```

Optional environment variable for the frontend:

- `VITE_DASHBOARD_WS_URL` — default: `ws://localhost:4000/dashboard`

## How the system works

1. The server starts and waits for incoming connections.
2. The agent starts on one or more computers.
3. Each agent collects system metrics and sends them to the server.
4. The server stores recent readings for each node.
5. The dashboard connects to the server and displays updates in real time.

## Main features

- Live monitoring of multiple nodes
- Real-time dashboard updates via WebSocket
- Lightweight architecture
- Clear separation between agent, server, and frontend
- Easy local setup for demonstration and testing

## Notes

- `node_modules`, `dist`, `.env`, logs, and temporary files should not be committed to Git.
- A `.gitignore` file is included to keep the repository clean.
- If you want to build the agent into an `.exe` file, it is better not to store the built executable in the repository.

## Future improvements

Possible next steps for the project:

- user authentication
- alert system for high resource usage
- database storage for long-term history
- Docker support
- better filtering and analytics
- deployment to a public server

## License

This project is intended for educational use.
