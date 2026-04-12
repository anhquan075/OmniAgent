import { Page, expect } from '@playwright/test';

export const HASHKEY_TESTNET = {
  zkVerifier: '0x572D5DB8F76A23B969b6aeA13557A6Ce24583131',
  zkIdentityGate: '0xdAD39Eccf4d9B479b62258924A29af1C1134aF4a',
  vault: '0x605b6b8C83d8b0EA8867BEda4099DE4F042F7318',
  agentNFA: '0xdFf5A296102818507313639E646C15cC53c5153A',
  chainId: 133,
  rpcUrl: 'https://testnet.hsk.xyz'
};

export const ENDPOINTS = {
  api: 'http://localhost:3001',
  frontend: 'http://localhost:5173'
};

export const TEST_WALLETS = {
  deployer: '0xB789D888A53D34f6701C1A5876101Cb32dbF17cF',
  testUser1: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  testUser2: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
};

export interface ZKProofRequest {
  subject: string;
  nullifier: string;
  currentYear: string;
  requiredKycLevel: string;
}

export interface ZKProofResponse {
  proof: any[];
  publicSignals: any[];
}

export async function waitForContractDataLoad(page: Page, timeoutMs: number = 5000) {
  await page.waitForTimeout(timeoutMs);
  await page.waitForLoadState('networkidle');
}

export async function findZKProofButton(page: Page) {
  const buttons = {
    submit: page.getByRole('button', { name: /Submit ZK Proof/i }),
    generating: page.getByRole('button', { name: /Generating/i }),
    verified: page.getByRole('button', { name: /Proof Verified/i })
  };

  for (const [state, button] of Object.entries(buttons)) {
    const count = await button.count();
    if (count > 0) {
      return { state, button };
    }
  }

  return null;
}

export async function generateZKProof(
  request: any,
  proofRequest: ZKProofRequest,
  timeoutMs: number = 60000
) {
  return await request.post(`${ENDPOINTS.api}/api/zk-proof/generate`, {
    data: proofRequest,
    timeout: timeoutMs
  });
}

export async function submitZKProof(
  request: any,
  proof: any[],
  publicSignals: any[]
) {
  return await request.post(`${ENDPOINTS.api}/api/zk-proof/submit`, {
    data: { proof, publicSignals }
  });
}

export async function checkVerifierAddress(request: any) {
  return await request.post(`${ENDPOINTS.api}/api/blockchain/call`, {
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
}

export async function hasValidProof(request: any, userAddress: string) {
  return await request.post(`${ENDPOINTS.api}/api/blockchain/call`, {
    data: {
      chain: 'hashkey',
      address: HASHKEY_TESTNET.zkIdentityGate,
      method: 'hasValidProof',
      args: [userAddress],
      abi: [{
        name: 'hasValidProof',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'user', type: 'address' }],
        outputs: [{ type: 'bool' }]
      }]
    }
  });
}

export async function navigateToZKSection(page: Page) {
  await page.goto(ENDPOINTS.frontend);
  await page.waitForLoadState('networkidle');
  
  const zkSection = page.getByText('ZK-Gated Access');
  await expect(zkSection).toBeVisible({ timeout: 10000 });
  
  return zkSection;
}

export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function isZeroAddress(address: string): boolean {
  return address === '0x0000000000000000000000000000000000000000' || 
         address.toLowerCase() === '0x' + '0'.repeat(40);
}

export async function expectButtonEnabled(page: Page, buttonName: string | RegExp) {
  const button = page.getByRole('button', { name: buttonName });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
}

export async function expectButtonDisabled(page: Page, buttonName: string | RegExp) {
  const button = page.getByRole('button', { name: buttonName });
  await expect(button).toBeVisible();
  await expect(button).toBeDisabled();
}

export async function expectNoWarningMessage(page: Page, warningText: string | RegExp) {
  const warning = page.getByText(warningText);
  const isVisible = await warning.isVisible().catch(() => false);
  expect(isVisible).toBe(false);
}

export async function waitForTransactionState(
  page: Page,
  expectedState: 'pending' | 'generating' | 'verified',
  timeoutMs: number = 30000
) {
  const stateTexts = {
    pending: /Submit ZK Proof/i,
    generating: /Generating/i,
    verified: /Proof Verified/i
  };

  const button = page.getByRole('button', { name: stateTexts[expectedState] });
  await expect(button).toBeVisible({ timeout: timeoutMs });
  
  return button;
}

export function createMockZKProofRequest(
  address: string = TEST_WALLETS.testUser1,
  kycLevel: string = '1'
): ZKProofRequest {
  return {
    subject: address,
    nullifier: Math.floor(Math.random() * 1000000).toString(),
    currentYear: new Date().getFullYear().toString(),
    requiredKycLevel: kycLevel
  };
}

export async function measurePerformance<T>(
  operation: () => Promise<T>,
  label: string
): Promise<{ result: T; durationMs: number }> {
  const startTime = Date.now();
  const result = await operation();
  const durationMs = Date.now() - startTime;
  
  console.log(`[Performance] ${label}: ${durationMs}ms`);
  
  return { result, durationMs };
}

export const EXPECTED_COLORS = {
  tealEnabled: 'rgb(20, 184, 166)',
  grayDisabled: 'rgb(128, 128, 128)',
  redError: 'rgb(239, 68, 68)'
};

export async function getButtonBackgroundColor(page: Page, buttonName: string | RegExp): Promise<string> {
  const button = page.getByRole('button', { name: buttonName });
  return await button.evaluate(el => window.getComputedStyle(el).backgroundColor);
}

export async function expectButtonColorNotGray(page: Page, buttonName: string | RegExp) {
  const color = await getButtonBackgroundColor(page, buttonName);
  expect(color).not.toContain('128, 128, 128');
}
