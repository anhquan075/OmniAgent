# Robot Fleet Simulation - Testing Guide

## Overview

The robot fleet simulation demonstrates autonomous robots earning ETH and sending it to the agent wallet for optimization. This guide helps you test the complete integration.

## Prerequisites

1. **Backend dependencies installed**: `cd backend && pnpm install`
2. **Environment configured**: `.env.wdk` file with required variables
3. **Optional wallet setup**: Set `ROBOT_FLEET_PRIVATE_KEY` or `WDK_SECRET_SEED` for real blockchain transactions

## Quick Start

### Option 1: Test Without Real Transactions (Development Mode)

If you don't have `ROBOT_FLEET_PRIVATE_KEY` configured, the simulator will run in mock mode:
- Events are generated
- Payments are logged but not sent
- SSE stream still works

```bash
# Terminal 1: Start backend server
cd backend
pnpm run dev

# Terminal 2: Start robot fleet simulator
cd backend
pnpm run robot:dev

# Terminal 3: Test SSE connection
curl -N http://localhost:3001/api/robot-fleet/events
```

### Option 2: Test With Real Transactions (Production Mode)

Add to `backend/.env.wdk`:
```env
ROBOT_FLEET_PRIVATE_KEY=0x...your_private_key...
# OR use WDK_SECRET_SEED if already configured
```

Then run the same commands as Option 1. The simulator will:
- Generate real ETH transactions
- Send payments to the agent wallet
- Log transaction hashes

## Environment Variables

Add to `backend/.env.wdk`:

```env
# Robot Fleet Configuration (optional)
ROBOT_FLEET_PRIVATE_KEY=0x...   # Private key for robot wallet (hex format)
# OR reuse the agent wallet:
# WDK_SECRET_SEED=...           # BIP-39 mnemonic (already configured for agent)

# Blockchain RPC (required)
BNB_RPC_URL=https://bsc-testnet.public.blastapi.io
```

**Note**: If neither `ROBOT_FLEET_PRIVATE_KEY` nor `WDK_SECRET_SEED` is set, the simulator runs in **mock mode** (no real transactions).

## API Endpoints

### 1. Server-Sent Events (SSE) - Real-time Fleet Updates

```bash
curl -N http://localhost:3001/api/robot-fleet/events
```

**Response format:**
```
event: message
data: {"type":"connected","message":"Robot Fleet Stream Connected","timestamp":"2026-03-16T..."}

event: fleet-event
data: {"type":"fleet:status","robots":[...],"totalEarned":"0.0","activeRobots":3}

event: fleet-event
data: {"type":"fleet:task-completed","event":{"robotId":"delivery-001","type":"Delivery","emoji":"🚚","taskName":"Package Delivery","earnings":"0.015","timestamp":"2026-03-16T...","txHash":"0x..."}}

event: heartbeat
data: {"type":"heartbeat","timestamp":"2026-03-16T..."}
```

### 2. Fleet Status - Polling Fallback

```bash
curl http://localhost:3001/api/robot-fleet/status
```

**Response:**
```json
{
  "robots": [
    {
      "id": "delivery-001",
      "type": "Delivery",
      "emoji": "🚚",
      "status": "Working",
      "totalEarned": "0.045",
      "taskCount": 3
    }
  ],
  "totalEarned": "0.045",
  "activeRobots": 3
}
```

## Configuration File

Edit `backend/config/robot-fleet.json` to customize:

```json
{
  "agentWallet": "0x...",           // Agent wallet receiving earnings
  "fleetSize": 3,                    // Number of robots
  "taskIntervalMs": [20000, 60000],  // Min/max delay between tasks
  "earningsRange": [0.005, 0.02],    // Min/max ETH per task
  "robots": [
    {
      "id": "delivery-001",
      "type": "Delivery",
      "emoji": "🚚"
    }
  ]
}
```

## Monitoring

### Console Logs

**Backend server** logs:
```
[RobotFleetAPI] New SSE client connected
[RobotFleetAPI] SSE client disconnected
```

**Robot simulator** logs:
```
[FleetManager] Fleet initialized with 3 robots
[FleetManager] 🚚 delivery-001 completed 'Package Delivery' - Earned: 0.015 ETH
[PaymentExecutor] ✅ Payment sent: 0.015 ETH to 0x... (tx: 0x...)
[FleetManager] Fleet is operational. Event stream active.
```

**Autonomous agent** logs:
```
[AutonomousLoop] 🤖 Robot fleet earning detected: delivery-001 earned 0.015 ETH
```

### Event Flow

1. **Robot completes task** → Generates earning event
2. **Simulator** → Sends ETH to agent wallet (if configured)
3. **Event emitted** → Via `fleetEmitter.emit('fleet:event', event)`
4. **SSE clients** → Receive event in real-time
5. **Agent loop** → Detects balance increase, logs earning

## Troubleshooting

### Issue: "No events received in SSE"

**Check:**
- Is the backend server running? (`pnpm run dev`)
- Is the robot simulator running? (`pnpm run robot:dev`)
- Check browser console or curl output

### Issue: "Payments not sent"

**Check:**
- Is `ROBOT_FLEET_PRIVATE_KEY` or `WDK_SECRET_SEED` configured in `.env.wdk`?
- Does the robot wallet have enough ETH for gas fees?
- Check simulator logs for error messages

### Issue: "Connection timeout in SSE"

**Check:**
- Heartbeat interval is 30 seconds - wait for heartbeat event
- Network firewalls blocking long-lived connections
- Try `curl -N` flag to disable buffering

### Issue: "Agent not detecting earnings"

**Check:**
- Is `AutonomousLoop` running? (started automatically with backend)
- Check backend logs for `[AutonomousLoop] 🤖 Robot fleet earning detected`
- Verify agent wallet address matches `config/robot-fleet.json`

## Testing Checklist

- [ ] Backend starts without errors (`pnpm run dev`)
- [ ] Simulator starts and initializes fleet (`pnpm run robot:dev`)
- [ ] SSE connection works (curl test successful)
- [ ] Events appear in SSE stream every 20-60 seconds
- [ ] Status endpoint returns fleet data
- [ ] Heartbeat events every 30 seconds
- [ ] Agent loop logs robot earnings (check backend console)
- [ ] If wallet configured: transactions appear on blockchain explorer
- [ ] Multiple SSE clients can connect simultaneously
- [ ] SSE cleanup works (no memory leaks after disconnect)

## Next Steps

After verifying the backend works:

1. **Frontend Integration** (Phase 3):
   - Create React component to display robot fleet
   - Connect to SSE endpoint
   - Show real-time earnings and robot status
   - Add visual indicators for robot activity

2. **Agent Decision Making**:
   - Enhance agent to recognize robot earnings
   - Trigger yield optimization when balance increases
   - Log robot earnings in agent decision context

3. **Production Deployment**:
   - Configure production wallet with sufficient gas
   - Set up monitoring for failed transactions
   - Add alerts for stuck robots or payment failures
   - Implement retry logic for failed payments

## Files Modified

- `backend/scripts/robot-simulator.ts` - Main simulator script
- `backend/src/services/RobotFleetService.ts` - Service layer wrapper
- `backend/src/api/routes/robot-fleet.ts` - SSE and status endpoints
- `backend/src/agent/AutonomousLoop.ts` - Fleet earnings logging
- `backend/src/index.ts` - Route registration
- `backend/package.json` - Added robot simulator scripts
- `backend/config/robot-fleet.json` - Fleet configuration

## Documentation

- [Plan file](../plans/20260316-1600-robot-fleet-simulation/plan.md) - Implementation specification
- [README.md](../README.md) - Project setup instructions
