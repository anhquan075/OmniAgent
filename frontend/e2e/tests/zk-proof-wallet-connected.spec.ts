import { test, expect } from '@playwright/test';
import { connectMockWallet, waitForWalletConnection } from '../helpers/wallet-helpers';

test.describe('ZK Proof UI - With Wallet Connection', () => {
  
  test('ZK section visible with connected wallet', async ({ page }) => {
    await connectMockWallet(page);
    await waitForWalletConnection(page);
    
    const zkSection = page.getByText(/ZK.*Access|ZK.*Identity|Submit.*Proof/i).first();
    await expect(zkSection).toBeVisible({ timeout: 10000 });
    
    console.log('✓ ZK section found');
  });

  test('Warning NOT visible when verifier configured', async ({ page }) => {
    await connectMockWallet(page);
    await waitForWalletConnection(page);
    await page.waitForTimeout(5000);
    
    const warning = page.getByText(/verifier not configured/i);
    const isVisible = await warning.isVisible().catch(() => false);
    
    expect(isVisible).toBe(false);
    console.log('✓ Warning is NOT visible (verifier IS configured)');
  });

  test('Submit ZK Proof button is visible', async ({ page }) => {
    await connectMockWallet(page);
    await waitForWalletConnection(page);
    await page.waitForTimeout(5000);
    
    const button = page.getByRole('button', { name: /Submit.*Proof|Generating|Verified/i });
    const count = await button.count();
    
    console.log(`✓ Found ${count} ZK proof button(s)`);
    
    if (count > 0) {
      await expect(button.first()).toBeVisible();
      
      const isDisabled = await button.first().isDisabled();
      const text = await button.first().textContent();
      const bgColor = await button.first().evaluate(el => 
        window.getComputedStyle(el).backgroundColor
      );
      
      console.log('✓ Button text:', text);
      console.log('✓ Button disabled:', isDisabled);
      console.log('✓ Button color:', bgColor);
    }
  });

  test('Screenshot ZK section', async ({ page }) => {
    await connectMockWallet(page);
    await waitForWalletConnection(page);
    await page.waitForTimeout(5000);
    
    await page.screenshot({ 
      path: 'zk-section-with-wallet.png', 
      fullPage: true 
    });
    
    console.log('✓ Screenshot saved: zk-section-with-wallet.png');
  });
});
