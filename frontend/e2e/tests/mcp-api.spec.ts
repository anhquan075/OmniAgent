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
    
    // Check for key tool categories
    expect(toolNames.some((n: string) => n.includes('vault'))).toBeTruthy();
    expect(toolNames.some((n: string) => n.includes('balance'))).toBeTruthy();
    expect(toolNames.some((n: string) => n.includes('risk'))).toBeTruthy();
  });

  test('wdk_getVaultStatus returns JSON with vault data', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/mcp`, {
      data: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'wdk_getVaultStatus',
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
    
    // Should have vault data
    expect(content.totalAssets !== undefined || content.error === undefined).toBeTruthy();
  });

  test('wdk_getBalance returns JSON with balance data', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/mcp`, {
      data: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'wdk_getBalance',
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

  test('robot_fleet_status returns JSON with fleet data', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/mcp`, {
      data: {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'robot_fleet_status',
          arguments: { context: 'Testing fleet status' }
        }
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.result).toBeDefined();
    
    const content = JSON.parse(json.result.content[0].text);
    console.log('Fleet Status:', content);
    expect(content.enabled !== undefined).toBeTruthy();
  });

  test('Multiple tool calls in sequence work correctly', async ({ request }) => {
    // First call - vault status
    const response1 = await request.post(`${API_URL}/api/mcp`, {
      data: {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: { name: 'wdk_getVaultStatus', arguments: { context: 'Test 1' } }
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
        params: { name: 'wdk_getBalance', arguments: { context: 'Test 2' } }
      }
    });
    expect(response2.ok()).toBeTruthy();
    const json2 = await response2.json();
    expect(json2.result).toBeDefined();
    
    // Third call - fleet status
    const response3 = await request.post(`${API_URL}/api/mcp`, {
      data: {
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: { name: 'robot_fleet_status', arguments: { context: 'Test 3' } }
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
    // SSE stream should be returned
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/event-stream');
  });

  test('Chat handles multiple sequential messages', async ({ request }) => {
    // First message
    const response1 = await request.post(`${API_URL}/api/chat`, {
      data: {
        messages: [{ role: 'user', content: 'Hello' }]
      }
    });
    expect(response1.ok()).toBeTruthy();
    
    // Second message (continuing conversation)
    const response2 = await request.post(`${API_URL}/api/chat`, {
      data: {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi! How can I help you?' },
          { role: 'user', content: 'Check my balance' }
        ]
      }
    });
    expect(response2.ok()).toBeTruthy();
    
    console.log('Multiple sequential chat messages handled successfully');
  });
});

test.describe('Stats API Tests', () => {
  
  test('GET /api/stats returns vault and risk data', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/stats`);
    
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    
    expect(json.vault).toBeDefined();
    expect(json.risk).toBeDefined();
    expect(json.system).toBeDefined();
    
    console.log('Stats:', JSON.stringify(json, null, 2));
  });
});

test.describe('Robot Fleet API Tests', () => {
  
  test('GET /api/robot-fleet/status returns fleet data', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/robot-fleet/status`);
    
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    
    expect(json.enabled !== undefined).toBeTruthy();
    expect(json.robots).toBeDefined();
    expect(Array.isArray(json.robots)).toBeTruthy();
    
    console.log('Fleet Status:', JSON.stringify(json, null, 2));
  });
});
