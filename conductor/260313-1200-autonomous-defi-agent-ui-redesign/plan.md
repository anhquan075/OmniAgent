---
title: "UI Layout Refactor (Centered Cockpit)"
description: "Refactor the dashboard into a symmetric 3-column cockpit with the Agent Terminal at the center."
status: pending
priority: P1
effort: 2h
branch: main
tags: [ui, layout, react]
created: 2026-03-13
---

# UI Layout Refactor: Symmetric Cockpit

## Objective
Reposition the **Agent Chat UI** as the central main component of the interface, flanked by symmetric observability sidebars.

## Design
- **Left Sidebar (20%)**: Monitoring metrics (Sharpe Ratio, Gold Rail Status) + Chat History.
- **Center Column (60%)**: Premium Agent Terminal (Chat UI).
- **Right Sidebar (20%)**: Operational state (Allocation Map, Autonomous Activity Log).
- **Dashboard Access**: Full `ProofVaultV2Client` moved to a high-fidelity glassmorphic overlay toggleable via the header.

## Implementation Steps
1. Refactor `frontend/src/App.jsx` to use a 3-column flex/grid layout.
2. Implement responsive visibility (sidebars collapse or hide on smaller screens).
3. Create the `DashboardOverlay` component for deep-dive analytics.
4. Finalize visual polish (glowing pulses, symmetric spacing).

## Verification
- Verify centered alignment of the chat container.
- Confirm sidebars correctly flank the center on large screens.
- Test dashboard overlay toggle.
