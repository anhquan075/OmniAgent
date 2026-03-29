import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:3001';

test.describe('MCP Tools API Tests', () => {
  
  test('tools/list returns all MCP tools', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/mcp`, {
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.result).toBeDefined();
    expect(json.result.tools).toBeDefined();
    
    const toolNames = json.result.tools.map((t: any) => t.name);
    console.log('Available tools:', toolNames);
    
    expect(toolNames).toContain('wdk_vault_getBalance');
    expect(toolNames).toContain('sepolia_getBalance');
    expect(toolNames).toContain('wdk_engine_getRiskMetrics');
    
    // Cross-chain and X402 tools are disabled by default (ENABLE_CROSS_CHAIN=false, ENABLE_X402=false)
    expect(toolNames.filter((n: string) => n.startsWith('arbitrum_')).length).toBe(0);
    expect(toolNames.filter((n: string) => n.startsWith('polygon_')).length).toBe(0);
    expect(toolNames.filter((n: string) => n.startsWith('gnosis_')).length).toBe(0);
    expect(toolNames.filter((n: string) => n.startsWith('x402_')).length).toBe(0);
  });

  test('wdk_vault_getState returns JSON with vault data', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/mcp`, {
      data: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'wdk_vault_getState',
          arguments: { context: 'Testing vault status' }
        }
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.result).toBeDefined();
    expect(json.result.content).toBeDefined();
    
    const content = JSON.parse(json.result.content[0].text);
    console.log('Vault Status:', content);
    
    expect(content.currentBuffer !== undefined).toBeTruthy();
  });

  test('sepolia_getBalance returns JSON with balance data', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/mcp`, {
      data: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'sepolia_getBalance',
          arguments: { context: 'Testing balance check' }
        }
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.result).toBeDefined();
    
    const content = JSON.parse(json.result.content[0].text);
    console.log('Balance:', content);
    expect(content).toBeDefined();
  });

  test('wdk_vault_getBalance returns vault balance data', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/mcp`, {
      data: {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'wdk_vault_getBalance',
          arguments: { context: 'Testing balance' }
        }
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.result).toBeDefined();
    
    const content = JSON.parse(json.result.content[0].text);
    console.log('Balance:', content);
    expect(content).toBeDefined();
  });

  test('Multiple tool calls in sequence work correctly', async ({ request }) => {
    // First call - vault status
    const response1 = await request.post(`${API_URL}/api/mcp`, {
      data: {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: { name: 'wdk_vault_getState', arguments: { context: 'Test 1' } }
      }
    });
    expect(response1.ok()).toBeTruthy();
    const json1 = await response1.json();
    expect(json1.result).toBeDefined();
    
    // Second call - balance
    const response2 = await request.post(`${API_URL}/api/mcp`, {
      data: {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: { name: 'sepolia_getBalance', arguments: { context: 'Test 2' } }
      }
    });
    expect(response2.ok()).toBeTruthy();
    const json2 = await response2.json();
    expect(json2.result).toBeDefined();
    
    // Third call - another balance check
    const response3 = await request.post(`${API_URL}/api/mcp`, {
      data: {
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: { name: 'wdk_vault_getBalance', arguments: { context: 'Test 3' } }
      }
    });
    expect(response3.ok()).toBeTruthy();
    const json3 = await response3.json();
    expect(json3.result).toBeDefined();
    
    console.log('All 3 sequential tool calls completed successfully');
  });
});

test.describe('Chat API Tests', () => {
  
  test('Chat endpoint accepts messages and returns stream', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/chat`, {
      data: {
        messages: [{ role: 'user', content: 'Hello' }]
      }
    });
    
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('text/event-stream');
  });

  test('Chat with vault query returns response', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/chat`, {
      data: {
        messages: [{ role: 'user', content: 'What is the vault status?' }]
      }
    });
    
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('text/event-stream');
  });
});

test.describe('Stats API Tests', () => {
  
  test('Stats endpoint returns vault statistics', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/stats`);
    
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json).toBeDefined();
    expect(json.vault).toBeDefined();
    expect(json.vault.totalAssets).toBeDefined();
  });

  test('Risk metrics endpoint returns risk data', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/stats`);
    
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json).toBeDefined();
    expect(json.risk).toBeDefined();
    expect(json.risk.level).toBeDefined();
  });
});
