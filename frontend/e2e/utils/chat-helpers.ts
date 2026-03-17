import { Page } from '@playwright/test';

/**
 * Selectors for chat UI elements
 */
export const selectors = {
  // Input
  messageInput: 'textarea[placeholder*="message"], textarea[placeholder*="Ask"]',
  sendButton: 'button[aria-label*="Send"], button:has-text("Send")',
  
  // Suggested Actions
  suggestedAction: '[data-testid^="suggested-action"], button:has-text(/Vault Status|Check Risk|My Balance|Get USDT|Bridge Funds|Smart Account/)',
  
  // Command Palette
  commandPalette: '[data-testid="command-palette"], [role="listbox"]',
  commandItem: '[data-testid^="command-item"], [role="option"]',
  
  // Messages
  userMessage: '[data-testid="user-message"], .message:has-text(/^You:/)',
  assistantMessage: '[data-testid="assistant-message"], .message:not(:has-text(/^You:/))',
  messageContainer: '[data-testid="message-container"], .messages, [role="log"]',
  
  // Tool Invocations
  toolInvocation: '[data-testid^="tool-"], [data-testid*="invocation"]',
  toolName: '[data-testid="tool-name"], .tool-header',
  toolOutput: '[data-testid="tool-output"], .tool-result',
  
  // Status Indicators
  loadingIndicator: '[data-testid="loading"], .spinner, [aria-busy="true"]',
  errorMessage: '[data-testid="error"], .error, [role="alert"]',
  
  // Roadmap/Execution Checklist
  roadmapStep: '[data-testid="roadmap-step"], [data-testid="execution-step"]',
  roadmapProgress: '[data-testid="roadmap-progress"], .progress',
  
  // Cards
  balanceCard: '[data-testid="balance-card"], .balance-card',
};

/**
 * Wait for message to appear in chat
 */
export async function waitForMessage(
  page: Page,
  text: string,
  timeout = 5000
): Promise<void> {
  await page.locator(`text=${text}`).waitFor({ timeout });
}

/**
 * Send message via input (simulating user typing)
 */
export async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.locator(selectors.messageInput);
  await input.focus();
  await input.fill(text);
  await input.press('Enter');
}

/**
 * Click suggested action by text
 */
export async function clickSuggestedAction(
  page: Page,
  actionText: string
): Promise<void> {
  await page.locator(`button:has-text("${actionText}")`).first().click();
}

/**
 * Open command palette by typing /
 */
export async function openCommandPalette(page: Page): Promise<void> {
  const input = page.locator(selectors.messageInput);
  await input.focus();
  await input.fill('/');
}

/**
 * Select command from palette
 */
export async function selectCommand(page: Page, command: string): Promise<void> {
  await page.locator(`text=${command}`).first().click();
}

/**
 * Get all visible messages in chat
 */
export async function getAllMessages(page: Page): Promise<string[]> {
  const messages = await page.locator(selectors.messageContainer).locator('> *').allTextContents();
  return messages;
}

/**
 * Wait for tool invocation to complete
 */
export async function waitForToolCompletion(
  page: Page,
  toolName: string,
  timeout = 10000
): Promise<void> {
  // Wait for tool to appear
  await page.locator(`text=${toolName}`).waitFor({ timeout });
  // Wait for loading to finish
  await page.locator(selectors.loadingIndicator).waitFor({ state: 'hidden', timeout });
}

/**
 * Verify accessibility - check for ARIA labels
 */
export async function checkA11yLabels(page: Page): Promise<string[]> {
  const unlabeledElements = await page.locator('button:not([aria-label]):not([title]):not(:has-text())').count();
  const issues: string[] = [];
  
  if (unlabeledElements > 0) {
    issues.push(`Found ${unlabeledElements} unlabeled buttons`);
  }
  
  return issues;
}

/**
 * Scroll to bottom of chat
 */
export async function scrollToBottom(page: Page): Promise<void> {
  const container = page.locator(selectors.messageContainer).first();
  if (await container.isVisible()) {
    await container.evaluate(el => {
      el.scrollTop = el.scrollHeight;
    });
  }
}

/**
 * Get viewport measurements
 */
export async function getMeasurements(page: Page): Promise<{
  width: number;
  height: number;
  messageCount: number;
  isAtBottom: boolean;
}> {
  const size = page.viewportSize();
  const messageCount = await page.locator(selectors.messageContainer).locator('> *').count();
  const container = page.locator(selectors.messageContainer).first();
  
  let isAtBottom = false;
  if (await container.isVisible()) {
    isAtBottom = await container.evaluate(el => {
      return el.scrollHeight - el.scrollTop <= el.clientHeight + 100;
    });
  }
  
  return {
    width: size?.width || 0,
    height: size?.height || 0,
    messageCount,
    isAtBottom,
  };
}
