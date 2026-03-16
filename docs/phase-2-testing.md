# Phase 2 Testing Guide: Robot Fleet Simulation

## 1. Prerequisites
Ensure you have the latest dependencies installed:
```bash
cd backend && pnpm install
cd frontend && pnpm install
```

## 2. Running the Simulation

You will need **3 separate terminal windows**.

### Terminal A: Backend Server
Starts the API server and Agent Loop.
```bash
cd backend
pnpm run dev
```
*Expected Output*: Server running at http://localhost:3001

### Terminal B: Robot Simulator
Starts the standalone robot fleet script.
```bash
cd backend
pnpm run robot:start
```
*Expected Output*: Logs showing robots starting tasks and completing them (e.g., "🤖 R1 completed Delivery...").

### Terminal C: Frontend Dashboard
Starts the React UI.
```bash
cd frontend
pnpm run dev
```
*Expected Output*: URL (usually http://localhost:5173) to open in browser.

## 3. Verification Checklist

### Backend Verification
- [ ] **API Status**: Visit `http://localhost:3001/api/robot-fleet/status`. Should return JSON with `enabled: true` and robot list.
- [ ] **SSE Stream**: Run `curl -N http://localhost:3001/api/robot-fleet/events`. Should see `data: {...}` events appear periodically.
- [ ] **Agent Logs**: In Terminal A, watch for `💰 Fleet earnings detected` logs when the simulator sends funds.

### Frontend Verification
- [ ] **Widget Visibility**: "Robot Fleet Status" widget should appear on the dashboard.
- [ ] **Connection Status**: Green dot indicator should show "Live".
- [ ] **Live Updates**: Activity feed should scroll automatically as new events arrive.
- [ ] **Earnings**: "Total Fleet Earnings" counter should increase in real-time.

### Troubleshooting
- **No Events?**: Check if `robot:start` is actually running.
- **Connection Error?**: Ensure `VITE_API_URL` in `frontend/.env` matches the backend URL.
- **Agent not reacting?**: Ensure `ALLOW_AGENT_RUN=true` is set in `backend/.env.wdk` if you want the loop to process earnings.
