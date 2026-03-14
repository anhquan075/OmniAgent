import { chromium } from '@playwright/test';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  
  console.log('Navigating to http://localhost:5174...');
  try {
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
    // Wait a bit more for animations
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'screenshots/layout-v2.png', fullPage: true });
    console.log('Screenshot saved to frontend/screenshots/layout-v2.png');
  } catch (error) {
    console.error('Failed to take screenshot:', error);
  } finally {
    await browser.close();
  }
}

run();
