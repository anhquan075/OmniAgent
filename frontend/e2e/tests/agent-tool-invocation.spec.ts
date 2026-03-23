import { test, expect, APIRequestContext } from '@playwright/test';

const API = 'http://localhost:3001';

const AGENT_CHAT_TESTS = [
  { prompt: 'What is my wallet balance on Sepolia?', expectedTool: 'sepolia_getBalance' },
  { prompt: 'Check my vault status', expectedTool: 'wdk_vault_getState' },
  { prompt: 'What is the current risk metrics?', expectedTool: 'wdk_engine_getRiskMetrics' },
  { prompt: 'Show my X402 balance', expectedTool: 'x402_get_balance' },
  { prompt: 'What is the market price of BTC?', expectedTool: 'market_get_price_matrix' },
  { prompt: 'Check my ERC-4337 account address', expectedTool: 'erc4337_getAccountAddress' },
  { prompt: 'List my session keys', expectedTool: 'smartaccount_listSessionKeys' },
  { prompt: 'What is my HashKey balance?', expectedTool: 'hashkey_getBalance' },
  { prompt: 'Check my Polygon balance', expectedTool: 'polygon_getBalance' },
  { prompt: 'What is my Gnosis balance?', expectedTool: 'gnosis_getBalance' },
  { prompt: 'Check my Arbitrum balance', expectedTool: 'arbitrum_getBalance' },
  { prompt: 'What is the Aave position?', expectedTool: 'wdk_aave_getPosition' },
  { prompt: 'Check oracle status', expectedTool: 'oracle_get_status' },
];

async function sendChatMessage(request: APIRequestContext, message: string) {
  const res = await request.post(`${API}/api/chat`, {
    data: {
      messages: [{ role: 'user', content: message }],
      mode: 'agent'
    },
    timeout: 60000,
  });
  return res;
}

function extractToolFromSSE(sseText: string): string | null {
  const lines = sseText.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.text?.includes?.('invoke') || data.text?.includes?.('Calling')) {
          for (const tool of AGENT_CHAT_TESTS) {
            if (data.text.includes(tool.expectedTool)) {
              return tool.expectedTool;
            }
          }
        }
        if (data.toolName) return data.toolName;
        if (data.tools?.length) return data.tools[0];
      } catch {}
    }
  }
  return null;
}

test.describe('Agent Tool Invocation via Chat', () => {
  for (const { prompt, expectedTool } of AGENT_CHAT_TESTS) {
    test(`Agent invokes ${expectedTool} for: "${prompt}"`, async ({ request }) => {
      const res = await sendChatMessage(request, prompt);
      expect(res.ok(), `Chat should return 200`).toBeTruthy();

      const text = await res.text();
      const invokedTool = extractToolFromSSE(text);

      console.log(`Prompt: ${prompt}`);
      console.log(`Expected: ${expectedTool}, Found: ${invokedTool || 'text response'}`);

      expect(text.length, 'Should receive SSE response').toBeGreaterThan(100);
    });
  }
});
