# E2E Tests for HashKey ZK Proof Submission

## Test Coverage

The `hashkey-zk-proof-submission.spec.ts` test suite provides comprehensive end-to-end testing for the ZK proof submission feature, including:

### 1. Contract Verification (4 tests)
- ZK verifier contract deployment
- ZK Identity Gate verifier address validation
- Verifier address is not zero address

### 2. Backend API (3 tests)
- Input validation for proof generation
- Proof structure validation
- Proof submission endpoint existence

### 3. Frontend UI (6 tests)
- Dashboard loading
- ZK-Gated Access section visibility
- Submit ZK Proof button visibility
- Button enabled state when verifier configured
- Warning message absence when verifier configured
- Button text state validation (Submit/Generating/Verified)

### 4. MetaMask Integration (1 test)
- Transaction request triggering on button click

### 5. Contract State (2 tests)
- `hasValidProof` query functionality
- `getProofStatus` query functionality

### 6. Edge Cases (4 tests)
- Multiple submissions from same address
- Invalid KYC level rejection
- Invalid address format rejection
- Missing nullifier rejection

### 7. Performance (2 tests)
- Proof generation timeout compliance
- Contract read operation speed

### 8. Error Recovery (2 tests)
- Failed proof generation error messaging
- Network error handling

### 9. Visual Regression (1 test)
- ZK-Gated Access section rendering
- Button color validation (teal enabled vs gray disabled)

**Total: 25 comprehensive tests**

## Prerequisites

### Backend Requirements
```bash
cd backend
cp .env.example .env

# Configure in .env:
HASHKEY_ZK_VERIFIER_ADDRESS=0x572D5DB8F76A23B969b6aeA13557A6Ce24583131
HASHKEY_ZK_GATE_ADDRESS=0xdAD39Eccf4d9B479b62258924A29af1C1134aF4a
HASHKEY_VAULT_ADDRESS=0x605b6b8C83d8b0EA8867BEda4099DE4F042F7318
HASHKEY_RPC_URL=https://testnet.hsk.xyz

# Start backend
pnpm install
pnpm run dev
```

### Frontend Requirements
```bash
cd frontend
cp .env.example .env

# Configure in .env:
VITE_HASHKEY_ZK_GATE_ADDRESS=0xdAD39Eccf4d9B479b62258924A29af1C1134aF4a
VITE_HASHKEY_ZK_VERIFIER_ADDRESS=0x572D5DB8F76A23B969b6aeA13557A6Ce24583131

# Install dependencies
pnpm install

# Install Playwright browsers (first time only)
pnpm exec playwright install chromium
```

## Running Tests

### Run All E2E Tests
```bash
cd frontend
pnpm run test:e2e
```

### Run Specific Test File
```bash
pnpm exec playwright test e2e/tests/hashkey-zk-proof-submission.spec.ts
```

### Run Tests in UI Mode (Interactive)
```bash
pnpm run test:e2e:ui
```

### Run Tests in Debug Mode
```bash
pnpm run test:e2e:debug
```

### Run Specific Test by Name
```bash
pnpm exec playwright test -g "ZK verifier contract is deployed"
```

### Run Tests in Headed Mode (See Browser)
```bash
pnpm exec playwright test --headed
```

## Test Reports

### View HTML Report
```bash
pnpm run test:e2e:report
```

Reports are generated in `playwright-report/` directory.

## Test Configuration

Configuration is in `playwright.config.ts`:

- **Base URL**: `http://localhost:5173`
- **Headless**: `false` (tests run in visible browser)
- **Timeout**: 60 seconds per test
- **Action Timeout**: 10 seconds per action
- **Retries**: 2 on CI, 0 locally
- **Screenshots**: On failure only
- **Trace**: On first retry

## Environment Variables for Testing

The test suite uses these environment variables (set via `webServer` in config):

```bash
VITE_PLAYWRIGHT=true
VITE_API_URL=http://localhost:3001
VITE_DEFAULT_NETWORK=testnet
```

## Test Data

### HashKey Testnet Contracts
- **Chain ID**: 133
- **RPC**: https://testnet.hsk.xyz
- **ZK Verifier**: `0x572D5DB8F76A23B969b6aeA13557A6Ce24583131`
- **ZK Identity Gate**: `0xdAD39Eccf4d9B479b62258924A29af1C1134aF4a`
- **Vault**: `0x605b6b8C83d8b0EA8867BEda4099DE4F042F7318`

### Test Wallet
- **Address**: `0xB789D888A53D34f6701C1A5876101Cb32dbF17cF`

## Troubleshooting

### Tests Fail with "Navigation timeout"
- Ensure backend is running on `http://localhost:3001`
- Ensure frontend dev server is running on `http://localhost:5173`

### Tests Fail with "Verifier address is zero"
- Check `.env` configuration in both backend and frontend
- Verify contracts are deployed to HashKey testnet
- Run contract verification script:
  ```bash
  cd backend
  npx tsx scripts/verify-contracts.ts
  ```

### MetaMask Integration Tests Fail
- These tests require MetaMask extension installed
- For CI/CD, these tests should be skipped or use mock wallet

### Flaky Tests
- Increase timeouts in `playwright.config.ts`
- Add `await page.waitForTimeout(3000)` before assertions
- Use `waitForLoadState('networkidle')` before interactions

## CI/CD Integration

### GitHub Actions Example
```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 20
      
      - name: Install pnpm
        run: npm install -g pnpm
      
      - name: Install dependencies
        run: pnpm install
        working-directory: ./frontend
      
      - name: Install Playwright
        run: pnpm exec playwright install chromium
        working-directory: ./frontend
      
      - name: Start backend
        run: pnpm run dev &
        working-directory: ./backend
      
      - name: Run E2E tests
        run: pnpm run test:e2e
        working-directory: ./frontend
        env:
          CI: true
          VITE_HASHKEY_ZK_GATE_ADDRESS: ${{ secrets.HASHKEY_ZK_GATE_ADDRESS }}
          VITE_HASHKEY_ZK_VERIFIER_ADDRESS: ${{ secrets.HASHKEY_ZK_VERIFIER_ADDRESS }}
      
      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: frontend/playwright-report/
```

## Writing New Tests

### Test Structure Template
```typescript
test.describe('Feature Name', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND);
    await page.waitForLoadState('networkidle');
  });

  test('should do something', async ({ page }) => {
    const element = page.getByRole('button', { name: /Button Text/i });
    await expect(element).toBeVisible();
    await element.click();
    await expect(page.getByText(/Success/i)).toBeVisible();
  });
});
```

### Best Practices
1. Use semantic selectors (`getByRole`, `getByText`) over CSS selectors
2. Add appropriate `waitForLoadState` calls for async operations
3. Use `toBeVisible()` instead of `count() > 0` when possible
4. Set appropriate timeouts for blockchain operations (60s+)
5. Include both positive and negative test cases
6. Test edge cases and error scenarios

## Test Maintenance

### When Contracts Change
1. Update contract addresses in test constants
2. Update ABI if method signatures change
3. Re-run contract verification tests

### When UI Changes
1. Update selectors if button text/roles change
2. Update visual regression baselines
3. Review and update timeout values if needed

### When API Changes
1. Update request payloads in API tests
2. Update response validation expectations
3. Add tests for new endpoints

## Performance Benchmarks

Expected test execution times:
- Contract Verification: ~5-10s
- Backend API: ~10-15s
- Frontend UI: ~20-30s
- Full Suite: ~60-90s

If tests exceed these times, investigate network issues or optimize test setup.
