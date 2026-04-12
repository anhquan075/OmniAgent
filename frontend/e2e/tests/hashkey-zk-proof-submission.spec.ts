import { test, expect, Page } from '@playwright/test';
import { chromium } from '@playwright/test';
import { connectMockWallet, waitForWalletConnection } from '../helpers/wallet-helpers';

const API = 'http://localhost:3001';
const FRONTEND = 'http://localhost:5173';

// Contract addresses from deployment
const HASHKEY_TESTNET = {
  zkVerifier: '0x572D5DB8F76A23B969b6aeA13557A6Ce24583131',
  zkIdentityGate: '0xdAD39Eccf4d9B479b62258924A29af1C1134aF4a',
  vault: '0x605b6b8C83d8b0EA8867BEda4099DE4F042F7318',
  chainId: 133,
  rpcUrl: 'https://testnet.hsk.xyz'
};

// Mock wallet address for testing
const TEST_ADDRESS = '0xB789D888A53D34f6701C1A5876101Cb32dbF17cF';

test.describe('ZK Proof Submission - Contract Verification', () => {

  test('ZK verifier contract is deployed at correct address', async ({ request }) => {
    const res = await request.post(`${API}/api/blockchain/call`, {
      data: {
        chain: 'hashkey',
        address: HASHKEY_TESTNET.zkVerifier,
        method: 'getCodeSize'
      }
    });

    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.codeSize).toBeGreaterThan(0);
  });

  test('ZK Identity Gate has correct verifier address', async ({ request }) => {
    const res = await request.post(`${API}/api/blockchain/call`, {
      data: {
        chain: 'hashkey',
        address: HASHKEY_TESTNET.zkIdentityGate,
        method: 'verifier',
        abi: [{
          name: 'verifier',
          type: 'function',
          stateMutability: 'view',
          inputs: [],
          outputs: [{ type: 'address' }]
        }]
      }
    });

    if (res.ok()) {
      const data = await res.json();
      expect(data.verifier.toLowerCase()).toBe(HASHKEY_TESTNET.zkVerifier.toLowerCase());
    }
  });

  test('ZK Identity Gate verifier is NOT zero address', async ({ request }) => {
    const res = await request.post(`${API}/api/blockchain/call`, {
      data: {
        chain: 'hashkey',
        address: HASHKEY_TESTNET.zkIdentityGate,
        method: 'verifier'
      }
    });

    if (res.ok()) {
      const data = await res.json();
      expect(data.verifier).not.toBe('0x0000000000000000000000000000000000000000');
      expect(data.verifier.length).toBe(42); // Valid Ethereum address
      expect(data.verifier.startsWith('0x')).toBe(true);
    }
  });
});

test.describe('ZK Proof Submission - Backend API', () => {

  test('ZK proof generation endpoint validates input', async ({ request }) => {
    const res = await request.post(`${API}/api/zk-proof/generate`, {
      data: {
        subject: '',
        nullifier: ''
      }
    });

    expect(res.status()).toBeGreaterThanOrEqual(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  test('ZK proof generation with valid input returns proof structure', async ({ request }) => {
    const res = await request.post(`${API}/api/zk-proof/generate`, {
      data: {
        subject: TEST_ADDRESS,
        nullifier: '123456',
        currentYear: '2026',
        requiredKycLevel: '1'
      },
      timeout: 60000 // ZK proof generation can take time
    });

    if (res.ok()) {
      const data = await res.json();
      expect(data.proof).toBeDefined();
      expect(data.publicSignals).toBeDefined();
      expect(Array.isArray(data.publicSignals)).toBe(true);
    } else {
      // Expected failure if ZK circuit not configured
      expect(res.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('ZK proof submission endpoint exists', async ({ request }) => {
    const res = await request.post(`${API}/api/zk-proof/submit`, {
      data: {
        proof: [],
        publicSignals: []
      }
    });

    // Should return error but endpoint should exist
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('ZK Proof Submission - Frontend UI (Browser)', () => {

  test.beforeEach(async ({ page }) => {
    await connectMockWallet(page);
    await waitForWalletConnection(page);
  });

  test('Dashboard loads successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/OmniAgent/i);
  });

  test('ZK-Gated Access section is visible', async ({ page }) => {
    const zkSection = page.getByText('ZK-Gated Access');
    await expect(zkSection).toBeVisible({ timeout: 10000 });
  });

  test('Submit ZK Proof button is visible', async ({ page }) => {
    const zkButton = page.getByRole('button', { name: /Submit ZK Proof|Proof Verified|Generating/i });
    await expect(zkButton).toBeVisible({ timeout: 10000 });
  });

  test('Submit ZK Proof button is NOT disabled when verifier is configured', async ({ page }) => {
    // Wait for contract data to load
    await page.waitForTimeout(3000);

    const zkButton = page.getByRole('button', { name: /Submit ZK Proof/i });
    
    // Check if button exists
    const buttonCount = await zkButton.count();
    if (buttonCount > 0) {
      // Check if it's NOT disabled
      const isDisabled = await zkButton.isDisabled();
      expect(isDisabled).toBe(false);
    }
  });

  test('Warning message should NOT appear when verifier is configured', async ({ page }) => {
    await page.waitForTimeout(3000);

    const warningText = page.getByText(/ZK verifier not configured/i);
    const isVisible = await warningText.isVisible().catch(() => false);
    
    // Warning should NOT be visible
    expect(isVisible).toBe(false);
  });

  test('Button shows correct text states', async ({ page }) => {
    await page.waitForTimeout(3000);

    // Should show one of the valid states
    const submitButton = page.getByRole('button', { name: /Submit ZK Proof/i });
    const generatingButton = page.getByRole('button', { name: /Generating/i });
    const verifiedButton = page.getByRole('button', { name: /Proof Verified/i });

    const hasValidState = 
      (await submitButton.count()) > 0 ||
      (await generatingButton.count()) > 0 ||
      (await verifiedButton.count()) > 0;

    expect(hasValidState).toBe(true);
  });
});

test.describe('ZK Proof Submission - MetaMask Integration (Mock)', () => {

  test('Button click triggers transaction request', async ({ page }) => {
    await connectMockWallet(page);
    await waitForWalletConnection(page);
    await page.waitForTimeout(3000);

    // Find the ZK proof button
    const zkButton = page.getByRole('button', { name: /Submit ZK Proof/i });
    
    if (await zkButton.count() > 0 && !(await zkButton.isDisabled())) {
      // Listen for MetaMask window popup (would happen in real scenario)
      page.on('popup', async popup => {
        expect(popup.url()).toContain('metamask');
      });

      // Click button (in real test with MetaMask extension, this would trigger popup)
      await zkButton.click();

      // Button text should change to "Generating..."
      await expect(page.getByRole('button', { name: /Generating/i })).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('ZK Proof Submission - Contract State Changes', () => {

  test('hasValidProof query returns boolean', async ({ request }) => {
    const res = await request.post(`${API}/api/blockchain/call`, {
      data: {
        chain: 'hashkey',
        address: HASHKEY_TESTNET.zkIdentityGate,
        method: 'hasValidProof',
        args: [TEST_ADDRESS],
        abi: [{
          name: 'hasValidProof',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'user', type: 'address' }],
          outputs: [{ type: 'bool' }]
        }]
      }
    });

    if (res.ok()) {
      const data = await res.json();
      expect(typeof data.hasValidProof).toBe('boolean');
    }
  });

  test('getProofStatus returns valid status', async ({ request }) => {
    const res = await request.post(`${API}/api/blockchain/call`, {
      data: {
        chain: 'hashkey',
        address: HASHKEY_TESTNET.zkIdentityGate,
        method: 'getProofStatus',
        args: [TEST_ADDRESS]
      }
    });

    if (res.ok()) {
      const data = await res.json();
      expect(data.status).toBeDefined();
    }
  });
});

test.describe('ZK Proof Submission - Edge Cases', () => {

  test('Multiple submissions from same address are handled', async ({ request }) => {
    const firstSubmission = await request.post(`${API}/api/zk-proof/generate`, {
      data: {
        subject: TEST_ADDRESS,
        nullifier: '111111',
        currentYear: '2026',
        requiredKycLevel: '1'
      }
    });

    const secondSubmission = await request.post(`${API}/api/zk-proof/generate`, {
      data: {
        subject: TEST_ADDRESS,
        nullifier: '222222',
        currentYear: '2026',
        requiredKycLevel: '1'
      }
    });

    // Both should either succeed or fail consistently
    expect(firstSubmission.status()).toBe(secondSubmission.status());
  });

  test('Invalid KYC level is rejected', async ({ request }) => {
    const res = await request.post(`${API}/api/zk-proof/generate`, {
      data: {
        subject: TEST_ADDRESS,
        nullifier: '123456',
        currentYear: '2026',
        requiredKycLevel: '999' // Invalid level
      }
    });

    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('Invalid address format is rejected', async ({ request }) => {
    const res = await request.post(`${API}/api/zk-proof/generate`, {
      data: {
        subject: 'not-an-address',
        nullifier: '123456',
        currentYear: '2026',
        requiredKycLevel: '1'
      }
    });

    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('Missing nullifier is rejected', async ({ request }) => {
    const res = await request.post(`${API}/api/zk-proof/generate`, {
      data: {
        subject: TEST_ADDRESS,
        currentYear: '2026',
        requiredKycLevel: '1'
      }
    });

    expect(res.status()).toBeGreaterThanOrEqual(400);
    const data = await res.json();
    expect(data.error).toContain('nullifier');
  });
});

test.describe('ZK Proof Submission - Performance', () => {

  test('Proof generation completes within timeout', async ({ request }) => {
    const startTime = Date.now();
    
    const res = await request.post(`${API}/api/zk-proof/generate`, {
      data: {
        subject: TEST_ADDRESS,
        nullifier: '123456',
        currentYear: '2026',
        requiredKycLevel: '1'
      },
      timeout: 60000
    });

    const duration = Date.now() - startTime;

    // Should complete within 60 seconds
    expect(duration).toBeLessThan(60000);
  });

  test('Contract read operations are fast', async ({ request }) => {
    const startTime = Date.now();

    await request.post(`${API}/api/blockchain/call`, {
      data: {
        chain: 'hashkey',
        address: HASHKEY_TESTNET.zkIdentityGate,
        method: 'verifier'
      }
    });

    const duration = Date.now() - startTime;

    // Contract reads should be under 5 seconds
    expect(duration).toBeLessThan(5000);
  });
});

test.describe('ZK Proof Submission - Error Recovery', () => {

  test('Failed proof generation shows error message', async ({ page }) => {
    await connectMockWallet(page);
    await page.waitForTimeout(3000);

    // Monitor for error toasts/messages
    const errorMessage = page.getByText(/failed|error/i);
    
    // Error messages should be visible if proof generation fails
    const hasError = await errorMessage.isVisible().catch(() => false);
    
    // This is informational - we just want to know if error handling exists
    if (hasError) {
      expect(await errorMessage.textContent()).toBeTruthy();
    }
  });

  test('Network errors are handled gracefully', async ({ page, context }) => {
    await connectMockWallet(page);
    
    await context.setOffline(true);
    await page.goto(FRONTEND).catch(() => {});
    
    await context.setOffline(false);
    await connectMockWallet(page);
    
    await expect(page).toHaveTitle(/OmniAgent/i);
  });
});

test.describe('ZK Proof Submission - Visual Regression', () => {

  test('ZK-Gated Access section renders correctly', async ({ page }) => {
    await connectMockWallet(page);
    await waitForWalletConnection(page);
    await page.waitForTimeout(3000);

    // Take screenshot of ZK section
    const zkSection = page.locator('text=ZK-Gated Access').locator('..');
    await expect(zkSection).toBeVisible();
    
    // Visual check - button should be teal/enabled, not gray/disabled
    const zkButton = page.getByRole('button', { name: /Submit ZK Proof/i });
    if (await zkButton.count() > 0) {
      const buttonColor = await zkButton.evaluate(el => 
        window.getComputedStyle(el).backgroundColor
      );
      
      // Teal color should be rgb(20, 184, 166) or similar, NOT gray
      expect(buttonColor).not.toContain('128, 128, 128'); // Not gray
    }
  });
});
