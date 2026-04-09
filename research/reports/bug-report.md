# OmniAgent Bug Report — HashKey Hackathon

**Date:** April 9, 2026  
**Project:** OmniAgent - ZK-Verified Autonomous Capital Allocator Fleet  
**Context:** HashKey Chain On-Chain Horizon Hackathon (DoraHacks #2045)

---

## Executive Summary

Analyzed **~1,500 lines** of core backend files and **~800 lines** of frontend components for the HashKey hackathon submission. Identified **12 bugs** across security, error handling, state management, and logic categories.

| Severity | Count |
|----------|-------|
| 🔴 Critical | 2 |
| 🟠 High | 4 |
| 🟡 Medium | 4 |
| 🔵 Low | 2 |

---

## Critical Bugs

### BUG-001: Hardhat Process Never Killed — Memory Leak in hashkey-tools.ts

**File:** `backend/src/mcp-server/handlers/hashkey-tools.ts`  
**Lines:** 12-27  
**Severity:** 🔴 Critical

**Issue:**
```typescript
function runHardhatTask(taskName: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['hardhat', taskName, ...args, '--network', 'hashkey'], {
      cwd: backendDir,
      env: { ...process.env },
    });
    // BUG: No timeout, no process cleanup on cancellation
    proc.on('close', (code) => { /* ... */ });
    // Missing: proc.kill() call, timeout handling, stderr timeout
  });
}
```

**Problems:**
1. **No timeout** — Long-running hardhat tasks block forever
2. **No process kill** — Failed promises leave orphaned `npx` processes
3. **No stderr timeout** — Silent hangs on network issues
4. **Missing error handling** — `proc.on('error')` not handled

**Impact:** Server memory exhaustion under load, DOS vulnerability

**Fix Required:**
- Add timeout (e.g., 60 seconds)
- Call `proc.kill()` on timeout/cancellation
- Handle `proc.on('error')`
- Add AbortController support

---

### BUG-002: Insecure Fallback Secret in session-key-store.ts

**File:** `backend/src/lib/session-key-store.ts`  
**Line:** 4  
**Severity:** 🔴 Critical

**Issue:**
```typescript
function getMasterSecret(): string {
  return process.env.SESSION_KEY_MASTER_SECRET || 'default-dev-secret-change-in-production';
}
```

**Problem:** Hardcoded fallback secret for session key encryption. If `SESSION_KEY_MASTER_SECRET` is not set in production, encrypted session keys use a publicly-known secret.

**Impact:** All session keys can be decrypted by anyone who knows the fallback

**Fix Required:**
- Throw error if env var not set in production
- Use cryptographically random fallback for dev only with warning

---

## High Severity Bugs

### BUG-003: Silent Safe Multisig Failure in safe-multisig.ts

**File:** `backend/src/services/safe-multisig.ts`  
**Lines:** 52-59  
**Severity:** 🟠 High

**Issue:**
```typescript
export async function getPendingTxs(safeAddress: string): Promise<SafeTx[]> {
  try {
    const data = await safeFetch(...);
    return (data as { results: SafeTx[] }).results || [];
  } catch {
    return []; // Silent failure
  }
}
```

**Problem:** Network failures to Safe API return empty array silently. Tool reports "0 pending transactions" even when Safe service is down.

**Fix Required:**
- Log errors with logger.warn
- Return error indicator or throw
- Add retry logic

---

### BUG-004: Race Condition in FleetStatus.tsx

**File:** `frontend/src/components/dashboard/FleetStatus.tsx`  
**Lines:** 48-73  
**Severity:** 🟠 High

**Issue:**
```typescript
useEffect(() => {
  if (events.length > 0 && isInitialized) {
    // Updates robots state
    setRobots(prevRobots => { /* updates */ });
    // BUG: setFleetTotal called in separate setState
    setFleetTotal(prevTotal => (parseFloat(prevTotal || '0') + parseFloat(eventData.earnings)).toFixed(4));
  }
}, [events, isInitialized]);
```

**Problem:** `setRobots` and `setFleetTotal` called in same render cycle, but they depend on different state. Race condition when events arrive rapidly.

**Fix Required:**
- Combine into single state update
- Use functional updates that depend on each other properly

---

### BUG-005: Incorrect ABI Decoding in HashKeyVaultDashboard.tsx

**File:** `frontend/src/components/dashboard/HashKeyVaultDashboard.tsx`  
**Lines:** 104-108  
**Severity:** 🟠 High

**Issue:**
```typescript
useEffect(() => {
  if (kycInfo) {
    const [, level] = kycInfo as [string, number, number, bigint];
    setKycStatus({ isValid: level >= 1, level: Number(level), loading: false });
  }
}, [kycInfo]);
```

**Problem:** ABI returns `getKycInfo` as `(string ensName, uint8 level, uint8 status, uint256 updatedAt)`. The destructuring is correct, but `kycInfo` is a BigInt array in wagmi v5, not a tuple. Type assertion is wrong.

**Fix Required:**
- Handle BigInt conversion properly
- Cast correctly for wagmi v5

---

### BUG-006: KYC Level Array Out of Bounds in hashkey-tools.ts

**File:** `backend/src/mcp-server/handlers/hashkey-tools.ts`  
**Lines:** ~400  
**Severity:** 🟠 High

**Issue:**
```typescript
const levelNames = ['NONE', 'BASIC', 'ADVANCED', 'PREMIUM', 'ULTIMATE'];
// ...
kycLevelName: levelNames[Number(kycInfo[1])] || 'NONE',
```

**Problem:** If `kycInfo[1]` > 4 (e.g., future KYC levels), `levelNames[index]` returns `undefined` and the `|| 'NONE'` fallback works, but this masks valid higher levels.

**Fix Required:**
- Handle dynamic level names
- Return raw level if name not found

---

## Medium Severity Bugs

### BUG-007: Missing Error Boundary in App.tsx

**File:** `frontend/src/App.tsx`  
**Severity:** 🟡 Medium

**Issue:** React app has no ErrorBoundary component. If any component throws during render, entire app crashes.

**Fix Required:** Wrap main content with ErrorBoundary

---

### BUG-008: Unbounded Event Array in useRobotFleetEvents.tsx

**File:** `frontend/src/hooks/useRobotFleetEvents.tsx`  
**Lines:** 73-75  
**Severity:** 🟡 Medium

**Issue:**
```typescript
if (newEvents.length > 0) {
  setEvents((prev) => [...newEvents, ...prev].slice(0, 50));
}
```

**Problem:** Array slicing to 50 is good, but `seenTxHashesRef.current` Set grows unbounded. If app runs for days, Set contains all historical tx hashes.

**Fix Required:**
- Implement LRU eviction for Set
- Or use WeakSet/periodic cleanup

---

### BUG-009: Unused Empty useEffect in FleetStatus.tsx

**File:** `frontend/src/components/dashboard/FleetStatus.tsx`  
**Lines:** 113-116  
**Severity:** 🟡 Medium

**Issue:**
```typescript
useEffect(() => {
}, []);
```

**Problem:** Empty dependency array, no cleanup, no effect. Dead code or incomplete implementation.

**Fix Required:** Remove or implement the intended effect

---

### BUG-010: Missing await on async function in sepolia-tools.ts

**File:** `backend/src/mcp-server/handlers/sepolia-tools.ts`  
**Lines:** 38-51  
**Severity:** 🟡 Medium

**Issue:**
```typescript
(async () => {
  const signer = await getSigner();
  const policyGuard = getPolicyGuard();
  // ...
})();
```

**Problem:** Top-level await called at module load time. If WDK initialization fails, error is swallowed. No error handling on the IIFE.

**Fix Required:**
- Wrap in try/catch
- Log errors
- Consider moving to proper initialization

---

## Low Severity Bugs

### BUG-011: Duplicate CSS Classes in Button.tsx

**File:** `frontend/src/components/ui/Button.tsx`  
**Severity:** 🔵 Low

**Issue:** Potential duplicate class names in variant definitions

**Fix Required:** Audit CSS classes

---

### BUG-012: Unused Variable in wdk-tools.ts

**File:** `backend/src/mcp-server/handlers/wdk-tools.ts`  
**Line:** 24  
**Severity:** 🔵 Low

**Issue:** `walletAccountPromise` is set but never awaited/used in `getSignerOrCreatePendingTx`

**Fix Required:** Remove unused variable or use it

---

## Recommendations

### Immediate (Before Hackathon Deadline)
1. Fix BUG-001 (memory leak) — will crash server under load
2. Fix BUG-002 (insecure fallback) — security risk
3. Fix BUG-003 (silent Safe failure) — affects usability

### Post-Hackathon
1. Add comprehensive error boundaries in frontend
2. Implement proper monitoring/logging
3. Add integration tests for critical paths
4. Implement rate limiting on MCP endpoints

---

*Report generated: April 9, 2026*
