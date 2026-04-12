import { Page } from '@playwright/test';

export async function connectMockWallet(page: Page) {
  await page.goto('http://localhost:5173');
  
  await page.waitForFunction(() => {
    return window.localStorage !== undefined && window.sessionStorage !== undefined;
  });

  await page.evaluate(() => {
    const mockAccount = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    
    window.sessionStorage.setItem('wagmi.connected', 'true');
    window.sessionStorage.setItem('wagmi.store', JSON.stringify({
      state: {
        connections: {
          __type: 'Map',
          value: [[
            'mock',
            {
              accounts: [mockAccount],
              chainId: 133,
              connector: { id: 'mock', name: 'Mock', type: 'mock' }
            }
          ]]
        },
        current: 'mock',
        status: 'connected'
      },
      version: 2
    }));
  });

  await page.reload();
  await page.waitForTimeout(3000);
}

export async function waitForWalletConnection(page: Page, timeout: number = 10000) {
  await page.waitForFunction(
    () => {
      const addressPattern = /0x[a-fA-F0-9]{40}/;
      return addressPattern.test(document.body.textContent || '');
    },
    { timeout }
  ).catch(() => {
    console.log('Wallet connection not detected within timeout');
  });
}

export async function isWalletConnected(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const wagmiStore = window.sessionStorage.getItem('wagmi.store');
    if (!wagmiStore) return false;
    
    try {
      const data = JSON.parse(wagmiStore);
      return data?.state?.status === 'connected';
    } catch {
      return false;
    }
  });
}

export async function getConnectedAddress(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const match = document.body.textContent?.match(/0x[a-fA-F0-9]{40}/);
    return match ? match[0] : null;
  });
}

export async function switchToHashKeyChain(page: Page) {
  await page.evaluate(() => {
    window.sessionStorage.setItem('wagmi.recentConnectorId', 'mock');
  });
  
  const switchButton = page.getByRole('button', { name: /switch.*hashkey/i });
  const switchButtonExists = await switchButton.count() > 0;
  
  if (switchButtonExists) {
    await switchButton.click();
    await page.waitForTimeout(2000);
  }
}
